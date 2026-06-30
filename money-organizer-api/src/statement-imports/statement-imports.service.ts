import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BulkReviewCategoryDto } from './dto/bulk-review-category.dto';
import { UpdateStatementImportBatchDto } from './dto/update-statement-import-batch.dto';
import { UpdateImportedMovementDto } from './dto/update-imported-movement.dto';
import { ReviewableImportedMovementStatus } from './dto/update-imported-movement-status.dto';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { NubankPdfParser } from './parsers/nubank-pdf.parser';
import { OfxParser } from './parsers/ofx.parser';
import {
  normalizeAccountKey,
  normalizeExternalIdForDedupe,
  normalizeText,
} from './parsers/parser-utils';
import { StatementParser } from './parsers/statement-parser';
import {
  ImportedMovementCategorySuggestion,
  ImportedMovementReviewHints,
  ImportedMovementReviewMatch,
  ParsedStatement,
  ParsedStatementDirection,
  UploadedStatementFile,
} from './types';
import {
  ImportedMovementStatus,
  ImportedMovementReviewTarget,
  ImportedMovementReconciliationStatus,
  StatementImportBatchStatus,
  CategoryKind,
  Prisma,
  TransactionType,
} from '../../generated/prisma/client';

const FINANCIAL_ACCOUNT_SELECT = {
  id: true,
  name: true,
  type: true,
  institutionName: true,
  icon: true,
  color: true,
  isArchived: true,
};

const REVIEW_CATEGORY_SELECT = {
  id: true,
  name: true,
  icon: true,
  kind: true,
  isArchived: true,
};

const STATEMENT_IMPORT_BATCH_SELECT = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  files: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      provider: true,
      sourceType: true,
      fileHash: true,
      status: true,
      duplicateOfFileId: true,
      accountNumber: true,
      periodStart: true,
      periodEnd: true,
      openingBalanceCents: true,
      closingBalanceCents: true,
      totalInCents: true,
      totalOutCents: true,
      warnings: true,
      financialAccountId: true,
      financialAccount: {
        select: FINANCIAL_ACCOUNT_SELECT,
      },
      createdAt: true,
      updatedAt: true,
      movements: {
        select: {
          id: true,
          date: true,
          direction: true,
          amountCents: true,
          rawType: true,
          rawDescription: true,
          normalizedDescription: true,
          sourcePage: true,
          sourceLine: true,
          fingerprint: true,
          externalId: true,
          status: true,
          reviewTarget: true,
          reviewCategoryId: true,
          reviewCategory: {
            select: REVIEW_CATEGORY_SELECT,
          },
          reviewTransferAccountId: true,
          reviewTransferAccount: {
            select: FINANCIAL_ACCOUNT_SELECT,
          },
          reconciliationStatus: true,
          reconciliationNote: true,
          reconciliationReviewedAt: true,
          appliedTransactionId: true,
          appliedTransferId: true,
          appliedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

const TRANSFER_REVIEW_TYPE = 'TRANSFERENCIA';

const TRANSACTION_REVIEW_TYPES_BY_DIRECTION: Record<
  ParsedStatementDirection,
  Set<string>
> = {
  IN: new Set(['PIX', 'DINHEIRO', 'RENDIMENTO', 'ESTORNO', 'OUTRA_ENTRADA']),
  OUT: new Set([
    'PIX',
    'DEBITO',
    'CREDITO',
    'BOLETO',
    'DINHEIRO',
    'COMPRA',
    'OUTRA_SAIDA',
  ]),
};

const STATEMENT_IMPORT_BATCH_SUMMARY_SELECT = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  files: {
    select: {
      id: true,
      originalName: true,
      provider: true,
      sourceType: true,
      fileHash: true,
      status: true,
      duplicateOfFileId: true,
      periodStart: true,
      periodEnd: true,
      financialAccount: {
        select: FINANCIAL_ACCOUNT_SELECT,
      },
      _count: {
        select: {
          movements: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

function fileHash(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function toLocalDate(dateStr?: string): Date | undefined {
  if (!dateStr) {
    return undefined;
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toDateKey(value: Date | string) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function externalIdLookupValues(externalIds: string[]) {
  const values = new Set<string>();

  for (const externalId of externalIds) {
    const trimmed = externalId.trim();
    if (!trimmed) continue;

    const withoutReversal = trimmed.replace(/:reversal$/i, '');
    values.add(trimmed);
    values.add(withoutReversal);
    values.add(`${withoutReversal}:reversal`);
    values.add(`${withoutReversal}:REVERSAL`);
  }

  return [...values];
}

function externalDedupeKey(input: {
  provider: ParsedStatement['provider'];
  accountNumber?: string | null;
  externalId?: string | null;
  date: Date | string;
  direction: string;
  amountCents: number;
}) {
  const externalId = normalizeExternalIdForDedupe(
    input.externalId ?? undefined,
  );

  if (!externalId) {
    return undefined;
  }

  return [
    input.provider,
    normalizeAccountKey(input.accountNumber ?? undefined) ?? '',
    externalId,
    toDateKey(input.date),
    input.direction,
    input.amountCents,
  ].join('|');
}

const STATEMENT_DESCRIPTION_DEDUPE_PREFIXES = [
  /^TRANSFERENCIA RECEBIDA PELO PIX\s+/,
  /^TRANSFERENCIA ENVIADA PELO PIX\s+/,
  /^TRANSFERENCIA RECEBIDA\s+/,
  /^TRANSFERENCIA ENVIADA\s+/,
  /^TRANSFERENCIA DE SALDO NUINVEST\s+/,
  /^VALOR ADICIONADO NA CONTA POR CARTAO DE CREDITO\s+/,
  /^VALOR ADICIONADO NA CONTA POR CARTAO\s+/,
  /^VALOR ADICIONADO NA CONTA\s+/,
  /^PAGAMENTO DE FATURA\s+/,
  /^PAGAMENTO DE BOLETO EFETUADO\s+/,
  /^PAGAMENTO DE BOLETO\s+/,
  /^COMPRA NO DEBITO VIA NUPAY\s+/,
  /^COMPRA NO DEBITO\s+/,
  /^COMPRA NO CREDITO VIA NUPAY\s+/,
  /^COMPRA NO CREDITO\s+/,
  /^REEMBOLSO RECEBIDO PELO PIX\s+/,
  /^PIX RECEBIDO\s+/,
  /^PIX ENVIADO\s+/,
  /^RENDIMENTO\s+/,
  /^DEPOSITO\s+/,
  /^ESTORNO\s+/,
];

const STATEMENT_DESCRIPTION_DEDUPE_SUFFIXES = [/\s+PAGAMENTO$/];

function normalizeStatementMovementDescriptionForDedupe(
  value?: string | null,
) {
  let normalized = normalizeReviewDescription(value);

  if (!normalized) {
    return undefined;
  }

  const original = normalized;
  let previous: string;
  do {
    previous = normalized;
    for (const prefix of STATEMENT_DESCRIPTION_DEDUPE_PREFIXES) {
      normalized = normalized.replace(prefix, '').trim();
    }
    for (const suffix of STATEMENT_DESCRIPTION_DEDUPE_SUFFIXES) {
      normalized = normalized.replace(suffix, '').trim();
    }
  } while (normalized && normalized !== previous);

  return normalized || original;
}

function statementMovementDescriptionDedupeKeys(
  value?: string | null,
): string[] {
  const original = normalizeReviewDescription(value);
  const normalized = normalizeStatementMovementDescriptionForDedupe(value);
  const keys = new Set<string>();

  if (!original && !normalized) {
    return [];
  }

  const addKeyVariants = (description: string | undefined) => {
    if (!description) {
      return;
    }

    keys.add(description);
    const tokens = description.split(' ').filter(Boolean);
    for (const size of [4, 5, 6]) {
      if (tokens.length >= size) {
        keys.add(tokens.slice(0, size).join(' '));
      }
    }
  };

  addKeyVariants(normalized);

  const normalizedTokenCount =
    normalized?.split(' ').filter(Boolean).length ?? 0;
  if (normalizedTokenCount < 4) {
    addKeyVariants(original);
  }

  return [...keys];
}

function statementMovementDedupeKeys(input: {
  provider: ParsedStatement['provider'];
  accountNumber?: string | null;
  date: Date | string;
  direction: string;
  amountCents: number;
  rawType?: string | null;
  rawDescription?: string | null;
  normalizedDescription?: string | null;
}) {
  const accountKey = normalizeAccountKey(input.accountNumber ?? undefined);
  const descriptionKeys = new Set([
    ...statementMovementDescriptionDedupeKeys(input.normalizedDescription),
    ...statementMovementDescriptionDedupeKeys(input.rawDescription),
    ...statementMovementDescriptionDedupeKeys(input.rawType),
  ]);

  if (!accountKey || descriptionKeys.size === 0) {
    return [];
  }

  return [...descriptionKeys].map((descriptionKey) =>
    [
      input.provider,
      accountKey,
      toDateKey(input.date),
      input.direction,
      input.amountCents,
      descriptionKey,
    ].join('|'),
  );
}

function toCents(value: Prisma.Decimal | number | string): number {
  return new Prisma.Decimal(value).mul(100).toDecimalPlaces(0).toNumber();
}

function dateOnly(value: Date) {
  return toDateKey(value);
}

function signedDirection(amountCents: number): ParsedStatementDirection {
  return amountCents < 0 ? 'OUT' : 'IN';
}

function normalizeReviewDescription(value?: string | null) {
  return normalizeExternalIdForDedupe(value ?? undefined)
    ?.replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPotentialInvoicePayment(normalizedDescription?: string) {
  if (!normalizedDescription?.includes('FATURA')) {
    return false;
  }

  return (
    normalizedDescription.includes('PAGAMENTO') ||
    normalizedDescription.includes('PAGTO') ||
    normalizedDescription.includes('PGTO')
  );
}

function trimEditableText(value: string | undefined, fieldLabel: string) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${fieldLabel} não pode ficar em branco.`);
  }

  return trimmed;
}

function normalizeReviewType(value: string) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function validateTransactionReviewType(
  direction: ParsedStatementDirection,
  rawType: string,
) {
  const allowedTypes = TRANSACTION_REVIEW_TYPES_BY_DIRECTION[direction];

  if (allowedTypes.has(rawType)) {
    return;
  }

  const directionLabel = direction === 'IN' ? 'entrada' : 'saída';
  const allowedLabel = [...allowedTypes].join(', ');

  throw new BadRequestException(
    `Tipo revisado inválido para ${directionLabel}. Use um destes tipos: ${allowedLabel}. Para movimento entre contas, use TRANSFERENCIA.`,
  );
}

function reviewTypeToTransactionType(
  direction: ParsedStatementDirection,
  rawType: string,
) {
  const normalizedRawType = normalizeReviewType(rawType);
  validateTransactionReviewType(direction, normalizedRawType);

  if (direction === 'IN') {
    return TransactionType.INCOME;
  }

  const typeByReviewType: Record<string, TransactionType> = {
    PIX: TransactionType.PIX,
    DEBITO: TransactionType.DEBIT,
    CREDITO: TransactionType.CREDIT_CASH,
    BOLETO: TransactionType.DEBIT,
    DINHEIRO: TransactionType.CASH,
    COMPRA: TransactionType.DEBIT,
    OUTRA_SAIDA: TransactionType.DEBIT,
  };

  return typeByReviewType[normalizedRawType] ?? TransactionType.DEBIT;
}

function categoryKindForDirection(direction: ParsedStatementDirection) {
  return direction === 'IN' ? CategoryKind.INCOME : CategoryKind.EXPENSE;
}

function categoryKindMatchesDirection(
  kind: CategoryKind,
  direction: ParsedStatementDirection,
) {
  const expectedKind = categoryKindForDirection(direction);

  return kind === expectedKind || kind === CategoryKind.BOTH;
}

function centsToDecimal(cents: number) {
  return new Prisma.Decimal(cents).div(100);
}

function nextBatchStatusAfterApply(statuses: ImportedMovementStatus[]) {
  if (
    statuses.length > 0 &&
    statuses.every((status) => status === ImportedMovementStatus.APPLIED)
  ) {
    return StatementImportBatchStatus.APPLIED;
  }

  if (statuses.some((status) => status === ImportedMovementStatus.APPLIED)) {
    return StatementImportBatchStatus.PARTIALLY_APPLIED;
  }

  return StatementImportBatchStatus.REVIEWING;
}

type PreparedStatementFile = {
  upload: UploadedStatementFile & { buffer: Buffer };
  sha256: string;
  parsed: ParsedStatement;
};

type CategorySuggestionLookup = Map<
  string,
  Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      categoryIcon: string | null;
      count: number;
    }
  >
>;

type StatementFinancialAccount = {
  id: string;
  name: string;
  type: string;
  institutionName: string | null;
  icon: string | null;
  color: string | null;
  isArchived: boolean;
};

function statementAccountKey(
  provider: ParsedStatement['provider'],
  accountNumber?: string | null,
) {
  const accountKey = normalizeAccountKey(accountNumber ?? undefined);

  if (!accountKey) {
    return undefined;
  }

  return [provider, accountKey].join('|');
}

@Injectable()
export class StatementImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ofxParser: OfxParser,
    private readonly csvStatementParser: CsvStatementParser,
    private readonly nubankPdfParser: NubankPdfParser,
  ) {}

  private get parsers(): StatementParser[] {
    return [this.ofxParser, this.csvStatementParser, this.nubankPdfParser].sort(
      (left, right) => left.priority - right.priority,
    );
  }

  private async ensureActiveReviewCategory(
    userId: string,
    categoryId: string,
    direction: ParsedStatementDirection,
  ) {
    const expectedKind = categoryKindForDirection(direction);
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
        isArchived: false,
        kind: { in: [expectedKind, CategoryKind.BOTH] },
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw new NotFoundException(
        direction === 'IN'
          ? 'Categoria de receita revisada não encontrada ou incompatível.'
          : 'Categoria de despesa revisada não encontrada ou incompatível.',
      );
    }

    return category;
  }

  private async ensureActiveTransferAccount(userId: string, accountId: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: {
        id: accountId,
        userId,
        isArchived: false,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Conta de transferência não encontrada.');
    }

    return account;
  }

  private async findLedgerReconciliationMatches(
    userId: string,
    input: {
      financialAccountId: string;
      date: Date;
      direction: ParsedStatementDirection;
      amountCents: number;
    },
  ): Promise<ImportedMovementReviewMatch[]> {
    const startDate = new Date(input.date);
    const endDate = new Date(input.date);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const [transactions, transfers, adjustments] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId,
          financialAccountId: input.financialAccountId,
          amount: centsToDecimal(input.amountCents),
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          date: true,
          description: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
      this.prisma.transfer.findMany({
        where: {
          userId,
          amount: centsToDecimal(input.amountCents),
          date: { gte: startDate, lte: endDate },
          OR: [
            { fromAccountId: input.financialAccountId },
            { toAccountId: input.financialAccountId },
          ],
        },
        select: {
          id: true,
          amount: true,
          date: true,
          description: true,
          fromAccountId: true,
          toAccountId: true,
          fromAccount: {
            select: {
              name: true,
            },
          },
          toAccount: {
            select: {
              name: true,
            },
          },
        },
      }),
      this.prisma.balanceAdjustment.findMany({
        where: {
          userId,
          financialAccountId: input.financialAccountId,
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          amount: true,
          date: true,
          reason: true,
        },
      }),
    ]);

    const matches: ImportedMovementReviewMatch[] = [];

    for (const transaction of transactions) {
      const direction =
        transaction.type === TransactionType.INCOME ? 'IN' : 'OUT';
      const amountCents = toCents(transaction.amount);

      if (direction !== input.direction || amountCents !== input.amountCents) {
        continue;
      }

      matches.push({
        sourceType: 'TRANSACTION',
        sourceId: transaction.id,
        date: dateOnly(transaction.date),
        direction,
        amountCents,
        label: transaction.description?.trim() || transaction.category.name,
      });
    }

    for (const transfer of transfers) {
      const amountCents = toCents(transfer.amount);

      if (
        amountCents === input.amountCents &&
        input.direction === 'IN' &&
        transfer.toAccountId === input.financialAccountId
      ) {
        matches.push({
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          date: dateOnly(transfer.date),
          direction: 'IN',
          amountCents,
          label:
            transfer.description?.trim() ||
            `Transferência recebida de ${transfer.fromAccount.name}`,
        });
      }

      if (
        amountCents === input.amountCents &&
        input.direction === 'OUT' &&
        transfer.fromAccountId === input.financialAccountId
      ) {
        matches.push({
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          date: dateOnly(transfer.date),
          direction: 'OUT',
          amountCents,
          label:
            transfer.description?.trim() ||
            `Transferência enviada para ${transfer.toAccount.name}`,
        });
      }
    }

    for (const adjustment of adjustments) {
      const signedAmountCents = toCents(adjustment.amount);
      const direction = signedDirection(signedAmountCents);
      const amountCents = Math.abs(signedAmountCents);

      if (direction !== input.direction || amountCents !== input.amountCents) {
        continue;
      }

      matches.push({
        sourceType: 'BALANCE_ADJUSTMENT',
        sourceId: adjustment.id,
        date: dateOnly(adjustment.date),
        direction,
        amountCents,
        label: adjustment.reason,
      });
    }

    return matches.slice(0, 3);
  }

  private async assertMovementReady(
    userId: string,
    movement: {
      date: Date;
      amountCents: number;
      direction: ParsedStatementDirection;
      rawType: string;
      rawDescription: string;
      reviewTarget: ImportedMovementReviewTarget | null;
      reviewCategoryId: string | null;
      reviewTransferAccountId: string | null;
      reconciliationStatus: ImportedMovementReconciliationStatus;
      file: {
        financialAccountId: string | null;
      };
    },
  ) {
    if (movement.amountCents <= 0) {
      throw new BadRequestException(
        'Movimento pronto precisa ter valor positivo.',
      );
    }

    if (!movement.rawDescription.trim()) {
      throw new BadRequestException(
        'Movimento pronto precisa ter descrição revisada.',
      );
    }

    if (!movement.file.financialAccountId) {
      throw new BadRequestException(
        'Movimento pronto precisa ter conta financeira do extrato.',
      );
    }

    if (
      movement.reconciliationStatus ===
      ImportedMovementReconciliationStatus.CONFIRMED_DUPLICATE
    ) {
      throw new BadRequestException(
        'Movimento confirmado como duplicidade não pode ser marcado como pronto.',
      );
    }

    const reconciliationMatches = await this.findLedgerReconciliationMatches(
      userId,
      {
        financialAccountId: movement.file.financialAccountId,
        date: movement.date,
        direction: movement.direction,
        amountCents: movement.amountCents,
      },
    );

    if (
      reconciliationMatches.length > 0 &&
      movement.reconciliationStatus !==
        ImportedMovementReconciliationStatus.CONFIRMED_UNIQUE
    ) {
      throw new BadRequestException(
        'Existe possível match no ledger. Confirme a conciliação antes de marcar como pronto.',
      );
    }

    const reviewTarget =
      movement.reviewTarget ?? ImportedMovementReviewTarget.TRANSACTION;

    if (reviewTarget === ImportedMovementReviewTarget.TRANSFER) {
      if (!movement.reviewTransferAccountId) {
        throw new BadRequestException(
          'Transferência pronta precisa ter a outra conta informada.',
        );
      }

      if (
        movement.reviewTransferAccountId === movement.file.financialAccountId
      ) {
        throw new BadRequestException(
          'Transferência pronta precisa usar contas diferentes.',
        );
      }

      await this.ensureActiveTransferAccount(
        userId,
        movement.reviewTransferAccountId,
      );
      return;
    }

    validateTransactionReviewType(
      movement.direction,
      normalizeReviewType(movement.rawType),
    );

    if (!movement.reviewCategoryId) {
      throw new BadRequestException(
        'Transação pronta precisa ter categoria revisada.',
      );
    }

    await this.ensureActiveReviewCategory(
      userId,
      movement.reviewCategoryId,
      movement.direction,
    );
  }

  private async getTargetAccount(userId: string, financialAccountId?: string) {
    const targetAccount = financialAccountId
      ? await this.prisma.financialAccount.findFirst({
          where: {
            id: financialAccountId,
            userId,
            isArchived: false,
          },
          select: FINANCIAL_ACCOUNT_SELECT,
        })
      : null;

    if (financialAccountId && !targetAccount) {
      throw new BadRequestException(
        'Conta financeira não encontrada ou arquivada.',
      );
    }

    return targetAccount;
  }

  private addCategorySuggestionHistory(
    categorySuggestions: CategorySuggestionLookup,
    description: string | null | undefined,
    direction: ParsedStatementDirection,
    category: {
      id: string;
      name: string;
      icon: string | null;
      kind: CategoryKind;
      isArchived?: boolean;
    },
  ) {
    if (
      category.isArchived ||
      !categoryKindMatchesDirection(category.kind, direction)
    ) {
      return;
    }

    const descriptionKey = normalizeReviewDescription(description);
    if (!descriptionKey) {
      return;
    }

    const suggestionKey = [descriptionKey, direction].join('|');
    const suggestionsByCategory =
      categorySuggestions.get(suggestionKey) ?? new Map();
    const current = suggestionsByCategory.get(category.id) ?? {
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon,
      count: 0,
    };

    current.count += 1;
    suggestionsByCategory.set(category.id, current);
    categorySuggestions.set(suggestionKey, suggestionsByCategory);
  }

  private getCategorySuggestion(
    categorySuggestions: CategorySuggestionLookup,
    description: string,
    direction: ParsedStatementDirection,
  ): ImportedMovementCategorySuggestion | undefined {
    const descriptionKey = normalizeReviewDescription(description);
    if (!descriptionKey) {
      return undefined;
    }

    const suggestionKey = [descriptionKey, direction].join('|');
    const suggestionsByCategory = categorySuggestions.get(suggestionKey);

    if (!suggestionsByCategory) {
      return undefined;
    }

    const [bestSuggestion] = [...suggestionsByCategory.values()].sort(
      (left, right) => right.count - left.count,
    );

    if (!bestSuggestion) {
      return undefined;
    }

    return {
      categoryId: bestSuggestion.categoryId,
      categoryName: bestSuggestion.categoryName,
      categoryIcon: bestSuggestion.categoryIcon,
      confidence: 'EXACT_DESCRIPTION',
      basedOnCount: bestSuggestion.count,
    };
  }

  private async buildCategorySuggestionLookup(userId: string) {
    const [transactionCategoryHistory, importedMovementCategoryHistory] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: {
            userId,
            description: { not: null },
          },
          select: {
            description: true,
            type: true,
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                kind: true,
                isArchived: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        this.prisma.importedMovement.findMany({
          where: {
            userId,
            reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
            reviewCategoryId: { not: null },
            status: {
              notIn: [
                ImportedMovementStatus.DUPLICATE,
                ImportedMovementStatus.IGNORED,
              ],
            },
          },
          select: {
            direction: true,
            rawDescription: true,
            normalizedDescription: true,
            reviewCategory: {
              select: {
                id: true,
                name: true,
                icon: true,
                kind: true,
                isArchived: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 500,
        }),
      ]);

    const categorySuggestions: CategorySuggestionLookup = new Map();

    for (const transaction of transactionCategoryHistory) {
      this.addCategorySuggestionHistory(
        categorySuggestions,
        transaction.description,
        transaction.type === TransactionType.INCOME ? 'IN' : 'OUT',
        transaction.category,
      );
    }

    for (const movement of importedMovementCategoryHistory) {
      if (!movement.reviewCategory) {
        continue;
      }

      this.addCategorySuggestionHistory(
        categorySuggestions,
        movement.normalizedDescription || movement.rawDescription,
        movement.direction,
        movement.reviewCategory,
      );
    }

    return categorySuggestions;
  }

  private async findKnownFinancialAccountsByStatementAccount(
    userId: string,
    statements: ParsedStatement[],
  ) {
    const statementFiltersByKey = new Map<
      string,
      {
        provider: ParsedStatement['provider'];
        accountNumber: string;
      }
    >();

    for (const statement of statements) {
      const key = statementAccountKey(
        statement.provider,
        statement.accountNumber,
      );

      if (!key || !statement.accountNumber) {
        continue;
      }

      statementFiltersByKey.set(key, {
        provider: statement.provider,
        accountNumber: statement.accountNumber,
      });
    }

    if (statementFiltersByKey.size === 0) {
      return new Map<string, StatementFinancialAccount>();
    }

    const files = await this.prisma.statementImportFile.findMany({
      where: {
        userId,
        financialAccountId: { not: null },
        OR: [...statementFiltersByKey.values()],
      },
      select: {
        provider: true,
        accountNumber: true,
        financialAccount: {
          select: FINANCIAL_ACCOUNT_SELECT,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const accountsByStatement = new Map<string, StatementFinancialAccount>();
    const requestedKeys = new Set(statementFiltersByKey.keys());
    for (const file of files) {
      if (!file.financialAccount || file.financialAccount.isArchived) {
        continue;
      }

      const key = statementAccountKey(file.provider, file.accountNumber);
      if (!key || !requestedKeys.has(key) || accountsByStatement.has(key)) {
        continue;
      }

      accountsByStatement.set(key, file.financialAccount);
    }

    return accountsByStatement;
  }

  private parseUploadedFile(
    file: UploadedStatementFile | undefined,
  ): PreparedStatementFile {
    if (!file?.buffer || file.size === 0) {
      throw new BadRequestException(
        'Envie um arquivo de extrato para importar.',
      );
    }

    const buffer = file.buffer;
    const parser = this.parsers.find((candidate) =>
      candidate.canParse(file.originalname, file.mimetype, buffer),
    );

    if (!parser) {
      throw new BadRequestException(
        'Envie um extrato OFX, CSV/TSV ou PDF textual suportado.',
      );
    }

    return {
      upload: file as UploadedStatementFile & { buffer: Buffer },
      sha256: fileHash(buffer),
      parsed: parser.parse(buffer, file.originalname),
    };
  }

  private async attachMovementReviewHints<
    T extends {
      files: Array<{
        financialAccountId: string | null;
        movements: Array<{
          id: string;
          date: Date;
          direction: ParsedStatementDirection;
          amountCents: number;
          rawDescription: string;
          normalizedDescription: string;
          reconciliationStatus: ImportedMovementReconciliationStatus;
        }>;
      }>;
    },
  >(userId: string, batch: T) {
    const movementInputs = batch.files.flatMap((file) =>
      file.movements.map((movement) => ({ file, movement })),
    );

    if (movementInputs.length === 0) {
      return batch;
    }

    const accountIds = [
      ...new Set(
        batch.files
          .map((file) => file.financialAccountId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const movementDates = movementInputs.map(({ movement }) => movement.date);
    const startDate = new Date(
      Math.min(...movementDates.map((date) => date.getTime())),
    );
    const endDate = new Date(
      Math.max(...movementDates.map((date) => date.getTime())),
    );
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const [transactions, transfers, adjustments, categorySuggestions] =
      await Promise.all([
        accountIds.length > 0
          ? this.prisma.transaction.findMany({
              where: {
                userId,
                financialAccountId: { in: accountIds },
                date: { gte: startDate, lte: endDate },
              },
              select: {
                id: true,
                type: true,
                amount: true,
                date: true,
                description: true,
                financialAccountId: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    icon: true,
                    kind: true,
                    isArchived: true,
                  },
                },
              },
            })
          : [],
        accountIds.length > 0
          ? this.prisma.transfer.findMany({
              where: {
                userId,
                date: { gte: startDate, lte: endDate },
                OR: [
                  { fromAccountId: { in: accountIds } },
                  { toAccountId: { in: accountIds } },
                ],
              },
              select: {
                id: true,
                amount: true,
                date: true,
                description: true,
                fromAccountId: true,
                toAccountId: true,
                fromAccount: {
                  select: {
                    name: true,
                  },
                },
                toAccount: {
                  select: {
                    name: true,
                  },
                },
              },
            })
          : [],
        accountIds.length > 0
          ? this.prisma.balanceAdjustment.findMany({
              where: {
                userId,
                financialAccountId: { in: accountIds },
                date: { gte: startDate, lte: endDate },
              },
              select: {
                id: true,
                amount: true,
                date: true,
                reason: true,
                financialAccountId: true,
              },
            })
          : [],
        this.buildCategorySuggestionLookup(userId),
      ]);

    const matchesByKey = new Map<string, ImportedMovementReviewMatch[]>();
    const pushMatch = (
      accountId: string,
      date: Date,
      direction: ParsedStatementDirection,
      amountCents: number,
      match: ImportedMovementReviewMatch,
    ) => {
      const key = [accountId, dateOnly(date), direction, amountCents].join('|');
      const matches = matchesByKey.get(key) ?? [];
      matches.push(match);
      matchesByKey.set(key, matches);
    };

    for (const transaction of transactions) {
      const direction =
        transaction.type === TransactionType.INCOME ? 'IN' : 'OUT';
      const amountCents = toCents(transaction.amount);
      pushMatch(
        transaction.financialAccountId,
        transaction.date,
        direction,
        amountCents,
        {
          sourceType: 'TRANSACTION',
          sourceId: transaction.id,
          date: dateOnly(transaction.date),
          direction,
          amountCents,
          label: transaction.description?.trim() || transaction.category.name,
        },
      );
    }

    for (const transfer of transfers) {
      const amountCents = toCents(transfer.amount);

      if (accountIds.includes(transfer.toAccountId)) {
        pushMatch(transfer.toAccountId, transfer.date, 'IN', amountCents, {
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          date: dateOnly(transfer.date),
          direction: 'IN',
          amountCents,
          label:
            transfer.description?.trim() ||
            `Transferência recebida de ${transfer.fromAccount.name}`,
        });
      }

      if (accountIds.includes(transfer.fromAccountId)) {
        pushMatch(transfer.fromAccountId, transfer.date, 'OUT', amountCents, {
          sourceType: 'TRANSFER',
          sourceId: transfer.id,
          date: dateOnly(transfer.date),
          direction: 'OUT',
          amountCents,
          label:
            transfer.description?.trim() ||
            `Transferência enviada para ${transfer.toAccount.name}`,
        });
      }
    }

    for (const adjustment of adjustments) {
      const signedAmountCents = toCents(adjustment.amount);
      const direction = signedDirection(signedAmountCents);
      const amountCents = Math.abs(signedAmountCents);

      pushMatch(
        adjustment.financialAccountId,
        adjustment.date,
        direction,
        amountCents,
        {
          sourceType: 'BALANCE_ADJUSTMENT',
          sourceId: adjustment.id,
          date: dateOnly(adjustment.date),
          direction,
          amountCents,
          label: adjustment.reason,
        },
      );
    }

    return {
      ...batch,
      files: batch.files.map((file) => ({
        ...file,
        movements: file.movements.map((movement) => {
          const matchKey = [
            file.financialAccountId ?? '',
            dateOnly(movement.date),
            movement.direction,
            movement.amountCents,
          ].join('|');
          const reconciliationMatches =
            matchesByKey.get(matchKey)?.slice(0, 3) ?? [];
          const flags: string[] = [];
          const normalizedDescription = normalizeReviewDescription(
            movement.rawDescription,
          );

          if (reconciliationMatches.length > 0) {
            flags.push('POSSIBLE_LEDGER_MATCH');

            if (
              movement.reconciliationStatus ===
              ImportedMovementReconciliationStatus.PENDING
            ) {
              flags.push('RECONCILIATION_REQUIRED');
            }
          }

          if (normalizedDescription?.includes('PIX')) {
            flags.push('PIX_REQUIRES_MANUAL_TRANSFER_REVIEW');
          }

          if (isPotentialInvoicePayment(normalizedDescription)) {
            flags.push('INVOICE_PAYMENT_REQUIRES_DUPLICATE_REVIEW');
          }

          const reviewHints: ImportedMovementReviewHints = {
            reconciliationMatches,
            categorySuggestion: this.getCategorySuggestion(
              categorySuggestions,
              movement.normalizedDescription,
              movement.direction,
            ),
            flags,
          };

          return {
            ...movement,
            reviewHints,
          };
        }),
      })),
    };
  }

  async preview(
    userId: string,
    file: UploadedStatementFile | undefined,
    financialAccountId?: string,
  ) {
    const explicitTargetAccount = await this.getTargetAccount(
      userId,
      financialAccountId,
    );
    const prepared = this.parseUploadedFile(file);
    const inferredAccountsByStatement = explicitTargetAccount
      ? new Map<string, StatementFinancialAccount>()
      : await this.findKnownFinancialAccountsByStatementAccount(userId, [
          prepared.parsed,
        ]);
    const targetAccount =
      explicitTargetAccount ??
      inferredAccountsByStatement.get(
        statementAccountKey(
          prepared.parsed.provider,
          prepared.parsed.accountNumber,
        ) ?? '',
      ) ??
      null;

    return {
      file: {
        originalName: prepared.upload.originalname,
        size: prepared.upload.size,
        mimeType: prepared.upload.mimetype,
        sha256: prepared.sha256,
      },
      targetAccount,
      ...prepared.parsed,
    };
  }

  async createBatch(
    userId: string,
    files: UploadedStatementFile[] | undefined,
    financialAccountId?: string,
  ) {
    const targetAccount = await this.getTargetAccount(
      userId,
      financialAccountId,
    );
    const preparedFiles = (files ?? []).map((file) =>
      this.parseUploadedFile(file),
    );

    if (preparedFiles.length === 0) {
      throw new BadRequestException('Envie ao menos um arquivo de extrato.');
    }

    const fileHashes = [...new Set(preparedFiles.map((file) => file.sha256))];
    const fingerprints = [
      ...new Set(
        preparedFiles.flatMap((file) =>
          file.parsed.movements.map((movement) => movement.fingerprint),
        ),
      ),
    ];
    const externalIds = [
      ...new Set(
        preparedFiles.flatMap((file) =>
          file.parsed.movements
            .map((movement) => movement.externalId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    ];
    const externalIdCandidates = externalIdLookupValues(externalIds);

    const [
      existingFiles,
      existingMovements,
      categorySuggestions,
      knownAccountsByStatement,
    ] = await Promise.all([
      fileHashes.length > 0
        ? this.prisma.statementImportFile.findMany({
            where: {
              userId,
              fileHash: { in: fileHashes },
            },
            select: {
              id: true,
              fileHash: true,
            },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      fingerprints.length > 0
        ? this.prisma.importedMovement.findMany({
            where: {
              userId,
              OR: [
                { fingerprint: { in: fingerprints } },
                ...(externalIdCandidates.length > 0
                  ? [{ externalId: { in: externalIdCandidates } }]
                  : []),
              ],
            },
            select: {
              fingerprint: true,
              externalId: true,
              date: true,
              direction: true,
              amountCents: true,
              rawType: true,
              rawDescription: true,
              normalizedDescription: true,
              file: {
                select: {
                  provider: true,
                  accountNumber: true,
                },
              },
            },
          })
        : [],
      this.buildCategorySuggestionLookup(userId),
      targetAccount
        ? new Map<string, StatementFinancialAccount>()
        : this.findKnownFinancialAccountsByStatementAccount(
            userId,
            preparedFiles.map((file) => file.parsed),
          ),
    ]);

    const firstFileIdByHash = new Map<string, string>();
    for (const existingFile of existingFiles) {
      if (!firstFileIdByHash.has(existingFile.fileHash)) {
        firstFileIdByHash.set(existingFile.fileHash, existingFile.id);
      }
    }

    const seenFingerprints = new Set<string>();
    for (const movement of existingMovements) {
      seenFingerprints.add(String(movement.fingerprint));
    }
    const seenExternalIds = new Set(
      existingMovements
        .map((movement) =>
          externalDedupeKey({
            provider: movement.file.provider,
            accountNumber: movement.file.accountNumber,
            externalId: movement.externalId,
            date: movement.date,
            direction: movement.direction,
            amountCents: movement.amountCents,
          }),
        )
        .filter((value): value is string => Boolean(value)),
    );
    const seenStatementMovementKeys = new Set(
      existingMovements
        .flatMap((movement) =>
          statementMovementDedupeKeys({
            provider: movement.file.provider,
            accountNumber: movement.file.accountNumber,
            date: movement.date,
            direction: movement.direction,
            amountCents: movement.amountCents,
            rawType: movement.rawType,
            rawDescription: movement.rawDescription,
            normalizedDescription: movement.normalizedDescription,
          }),
        )
    );

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.statementImportBatch.create({
        data: {
          userId,
          status: 'REVIEWING',
        },
        select: { id: true },
      });

      for (const preparedFile of preparedFiles) {
        const duplicateOfFileId =
          firstFileIdByHash.get(preparedFile.sha256) ?? null;
        const inferredTargetAccount =
          targetAccount ??
          knownAccountsByStatement.get(
            statementAccountKey(
              preparedFile.parsed.provider,
              preparedFile.parsed.accountNumber,
            ) ?? '',
          ) ??
          null;
        const movementRows = preparedFile.parsed.movements.map((movement) => {
          const movementExternalDedupeKey = externalDedupeKey({
            provider: preparedFile.parsed.provider,
            accountNumber: preparedFile.parsed.accountNumber,
            externalId: movement.externalId,
            date: movement.date,
            direction: movement.direction,
            amountCents: movement.amountCents,
          });
          const hasSeenExternalId = movementExternalDedupeKey
            ? seenExternalIds.has(movementExternalDedupeKey)
            : false;
          const movementStatementDedupeKeys = statementMovementDedupeKeys({
            provider: preparedFile.parsed.provider,
            accountNumber: preparedFile.parsed.accountNumber,
            date: movement.date,
            direction: movement.direction,
            amountCents: movement.amountCents,
            rawType: movement.rawType,
            rawDescription: movement.rawDescription,
            normalizedDescription: movement.normalizedDescription,
          });
          const hasSeenStatementMovement = movementStatementDedupeKeys.some(
            (key) => seenStatementMovementKeys.has(key),
          );
          const isDuplicateMovement =
            hasSeenExternalId ||
            hasSeenStatementMovement ||
            seenFingerprints.has(movement.fingerprint);

          if (!isDuplicateMovement) {
            seenFingerprints.add(movement.fingerprint);
            if (movementExternalDedupeKey) {
              seenExternalIds.add(movementExternalDedupeKey);
            }
            for (const key of movementStatementDedupeKeys) {
              seenStatementMovementKeys.add(key);
            }
          }
          const categorySuggestion = isDuplicateMovement
            ? undefined
            : this.getCategorySuggestion(
                categorySuggestions,
                movement.normalizedDescription,
                movement.direction,
              );

          return {
            date: toLocalDate(movement.date) ?? new Date(movement.date),
            direction: movement.direction,
            amountCents: movement.amountCents,
            rawType: movement.rawType,
            rawDescription: movement.rawDescription,
            normalizedDescription: movement.normalizedDescription,
            sourcePage: movement.sourcePage,
            sourceLine: movement.sourceLine,
            fingerprint: movement.fingerprint,
            externalId: movement.externalId,
            status: isDuplicateMovement
              ? ('DUPLICATE' as const)
              : categorySuggestion
                ? ('NEEDS_REVIEW' as const)
                : ('NEW' as const),
            reviewCategoryId: categorySuggestion?.categoryId,
            userId,
          };
        });

        const createdFile = await tx.statementImportFile.create({
          data: {
            originalName: preparedFile.upload.originalname,
            mimeType: preparedFile.upload.mimetype,
            size: preparedFile.upload.size,
            provider: preparedFile.parsed.provider,
            sourceType: preparedFile.parsed.sourceType,
            fileHash: preparedFile.sha256,
            status: duplicateOfFileId ? 'DUPLICATE' : 'PARSED',
            duplicateOfFileId,
            accountNumber: preparedFile.parsed.accountNumber,
            periodStart: toLocalDate(preparedFile.parsed.periodStart),
            periodEnd: toLocalDate(preparedFile.parsed.periodEnd),
            openingBalanceCents:
              preparedFile.parsed.summary?.openingBalanceCents,
            closingBalanceCents:
              preparedFile.parsed.summary?.closingBalanceCents,
            totalInCents: preparedFile.parsed.summary?.totalInCents,
            totalOutCents: preparedFile.parsed.summary?.totalOutCents,
            warnings: preparedFile.parsed.warnings as Prisma.InputJsonValue,
            batchId: createdBatch.id,
            financialAccountId: inferredTargetAccount?.id ?? null,
            userId,
            movements: {
              create: movementRows,
            },
          },
          select: { id: true },
        });

        if (!firstFileIdByHash.has(preparedFile.sha256)) {
          firstFileIdByHash.set(preparedFile.sha256, createdFile.id);
        }
      }

      return createdBatch;
    });

    return this.findBatch(userId, batch.id);
  }

  findBatches(userId: string) {
    return this.prisma.statementImportBatch.findMany({
      where: { userId },
      select: STATEMENT_IMPORT_BATCH_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findBatch(userId: string, batchId: string) {
    const batch = await this.prisma.statementImportBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      select: STATEMENT_IMPORT_BATCH_SELECT,
    });

    if (!batch) {
      throw new NotFoundException('Lote de importação não encontrado.');
    }

    return this.attachMovementReviewHints(userId, batch);
  }

  async updateBatch(
    userId: string,
    batchId: string,
    dto: UpdateStatementImportBatchDto,
  ) {
    if (dto.name === undefined) {
      throw new BadRequestException('Informe o nome do lote para atualizar.');
    }

    const name = dto.name?.trim() || null;

    const batch = await this.prisma.statementImportBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote de importação não encontrado.');
    }

    await this.prisma.statementImportBatch.update({
      where: {
        id: batch.id,
      },
      data: {
        name,
      },
      select: {
        id: true,
      },
    });

    return this.findBatch(userId, batch.id);
  }

  async removeBatch(userId: string, batchId: string) {
    const batch = await this.prisma.statementImportBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote de importação não encontrado.');
    }

    const appliedMovements = await this.prisma.importedMovement.count({
      where: {
        userId,
        status: ImportedMovementStatus.APPLIED,
        file: {
          batchId,
          userId,
        },
      },
    });

    if (appliedMovements > 0) {
      throw new BadRequestException(
        'Lote com movimentos aplicados não pode ser excluído para preservar a rastreabilidade.',
      );
    }

    await this.prisma.statementImportBatch.delete({
      where: {
        id: batch.id,
      },
    });

    return {
      message: 'Lote de importação excluído com sucesso.',
    };
  }

  async bulkReviewCategory(
    userId: string,
    batchId: string,
    dto: BulkReviewCategoryDto,
  ) {
    const movementIds = Array.from(new Set(dto.movementIds));

    const batch = await this.prisma.statementImportBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote de importação não encontrado.');
    }

    const movements = await this.prisma.importedMovement.findMany({
      where: {
        id: { in: movementIds },
        userId,
        file: {
          batchId,
          userId,
        },
      },
      select: {
        id: true,
        direction: true,
        status: true,
        reviewTarget: true,
      },
    });

    if (movements.length !== movementIds.length) {
      throw new NotFoundException(
        'Um ou mais movimentos selecionados não pertencem ao lote.',
      );
    }

    const invalidMovement = movements.find(
      (movement) =>
        movement.status === ImportedMovementStatus.APPLIED ||
        movement.status === ImportedMovementStatus.DUPLICATE ||
        movement.reviewTarget !== ImportedMovementReviewTarget.TRANSACTION,
    );

    if (invalidMovement) {
      throw new BadRequestException(
        'Apenas transações importadas editáveis podem receber categoria em massa.',
      );
    }

    const directions = Array.from(
      new Set(movements.map((movement) => movement.direction)),
    );

    for (const direction of directions) {
      await this.ensureActiveReviewCategory(
        userId,
        dto.reviewCategoryId,
        direction,
      );
    }

    const summary = await this.prisma.$transaction(async (tx) => {
      const updatedMovements = await tx.importedMovement.updateMany({
        where: {
          id: { in: movementIds },
          userId,
          file: {
            batchId,
            userId,
          },
          status: {
            notIn: [
              ImportedMovementStatus.APPLIED,
              ImportedMovementStatus.DUPLICATE,
            ],
          },
          reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
        },
        data: {
          reviewCategoryId: dto.reviewCategoryId,
          reviewTransferAccountId: null,
          reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
          status: ImportedMovementStatus.NEEDS_REVIEW,
          reconciliationStatus: ImportedMovementReconciliationStatus.PENDING,
          reconciliationNote: null,
          reconciliationReviewedAt: null,
        },
      });

      if (updatedMovements.count !== movementIds.length) {
        throw new BadRequestException(
          'Movimentos selecionados foram alterados antes da categorização em massa.',
        );
      }

      const statuses = await tx.importedMovement.findMany({
        where: {
          file: {
            batchId,
            userId,
          },
        },
        select: {
          status: true,
        },
      });
      const batchStatus = nextBatchStatusAfterApply(
        statuses.map((movement) => movement.status),
      );

      await tx.statementImportBatch.update({
        where: {
          id: batchId,
        },
        data: {
          status: batchStatus,
        },
        select: {
          id: true,
        },
      });

      return {
        updatedCount: updatedMovements.count,
        batchStatus,
      };
    });

    return summary;
  }

  async updateMovement(
    userId: string,
    movementId: string,
    dto: UpdateImportedMovementDto,
  ) {
    const movement = await this.prisma.importedMovement.findFirst({
      where: {
        id: movementId,
        userId,
      },
      select: {
        id: true,
        status: true,
        direction: true,
        rawType: true,
        reviewTarget: true,
        reviewCategoryId: true,
        reviewTransferAccountId: true,
        reconciliationStatus: true,
        file: {
          select: {
            financialAccountId: true,
          },
        },
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimento importado não encontrado.');
    }

    if (movement.status === ImportedMovementStatus.APPLIED) {
      throw new BadRequestException(
        'Movimentos já aplicados não podem ser editados.',
      );
    }

    const rawType = trimEditableText(dto.rawType, 'Tipo');
    const rawDescription = trimEditableText(dto.rawDescription, 'Descrição');
    const hasChanges = [
      dto.date,
      dto.amountCents,
      dto.direction,
      rawType,
      rawDescription,
      dto.reviewTarget,
      dto.reviewCategoryId,
      dto.reviewTransferAccountId,
      dto.reconciliationStatus,
      dto.reconciliationNote,
    ].some((value) => value !== undefined);

    if (!hasChanges) {
      throw new BadRequestException(
        'Informe ao menos um campo para editar o movimento.',
      );
    }

    const hasReviewDataChanges = [
      dto.date,
      dto.amountCents,
      dto.direction,
      rawType,
      rawDescription,
      dto.reviewTarget,
      dto.reviewCategoryId,
      dto.reviewTransferAccountId,
    ].some((value) => value !== undefined);
    const data: Prisma.ImportedMovementUpdateInput = hasReviewDataChanges
      ? {
          status: ImportedMovementStatus.NEEDS_REVIEW,
        }
      : {};
    const effectiveDirection = dto.direction ?? movement.direction;
    const effectiveReviewTarget =
      dto.reviewTarget ??
      movement.reviewTarget ??
      ImportedMovementReviewTarget.TRANSACTION;
    const normalizedRawType =
      rawType !== undefined ? normalizeReviewType(rawType) : undefined;
    const reviewTypeToValidate =
      normalizedRawType ??
      (dto.direction !== undefined || dto.reviewTarget !== undefined
        ? normalizeReviewType(movement.rawType)
        : undefined);

    if (
      effectiveReviewTarget === ImportedMovementReviewTarget.TRANSFER ||
      dto.reviewTransferAccountId !== undefined
    ) {
      const reviewTransferAccountId =
        dto.reviewTransferAccountId !== undefined
          ? dto.reviewTransferAccountId
          : movement.reviewTransferAccountId;

      if (
        effectiveReviewTarget !== ImportedMovementReviewTarget.TRANSFER &&
        reviewTransferAccountId
      ) {
        throw new BadRequestException(
          'Conta de transferência só pode ser informada quando o alvo revisado for TRANSFER.',
        );
      }

      if (effectiveReviewTarget === ImportedMovementReviewTarget.TRANSFER) {
        if (!movement.file.financialAccountId) {
          throw new BadRequestException(
            'Selecione uma conta financeira para o arquivo antes de revisar transferência.',
          );
        }

        if (!reviewTransferAccountId) {
          throw new BadRequestException(
            'Informe a outra conta da transferência.',
          );
        }

        if (reviewTransferAccountId === movement.file.financialAccountId) {
          throw new BadRequestException(
            'A conta da transferência deve ser diferente da conta do extrato.',
          );
        }

        const reviewTransferAccount = await this.ensureActiveTransferAccount(
          userId,
          reviewTransferAccountId,
        );

        data.reviewTarget = ImportedMovementReviewTarget.TRANSFER;
        data.reviewCategory = {
          disconnect: true,
        };
        data.reviewTransferAccount = {
          connect: {
            id: reviewTransferAccount.id,
          },
        };
        data.rawType = TRANSFER_REVIEW_TYPE;
      }
    }

    if (effectiveReviewTarget === ImportedMovementReviewTarget.TRANSACTION) {
      if (reviewTypeToValidate !== undefined) {
        validateTransactionReviewType(effectiveDirection, reviewTypeToValidate);
      }

      data.reviewTarget = ImportedMovementReviewTarget.TRANSACTION;
      data.reviewTransferAccount = {
        disconnect: true,
      };

      if (dto.reviewCategoryId !== undefined) {
        if (dto.reviewCategoryId) {
          const category = await this.ensureActiveReviewCategory(
            userId,
            dto.reviewCategoryId,
            effectiveDirection,
          );

          data.reviewCategory = {
            connect: {
              id: category.id,
            },
          };
        } else {
          data.reviewCategory = {
            disconnect: true,
          };
        }
      }
    }

    if (dto.date !== undefined) {
      data.date = toLocalDate(dto.date) ?? new Date(dto.date);
    }

    if (dto.amountCents !== undefined) {
      data.amountCents = dto.amountCents;
    }

    if (dto.direction !== undefined) {
      data.direction = dto.direction;
    }

    if (
      normalizedRawType !== undefined &&
      effectiveReviewTarget === ImportedMovementReviewTarget.TRANSACTION
    ) {
      data.rawType = normalizedRawType;
    }

    if (rawDescription !== undefined) {
      data.rawDescription = rawDescription;
      data.normalizedDescription = normalizeText(rawDescription).toUpperCase();
    }

    if (hasReviewDataChanges && dto.reconciliationStatus === undefined) {
      data.reconciliationStatus = ImportedMovementReconciliationStatus.PENDING;
      data.reconciliationNote = null;
      data.reconciliationReviewedAt = null;
    }

    if (dto.reconciliationStatus !== undefined) {
      data.reconciliationStatus = dto.reconciliationStatus;
      data.reconciliationNote =
        dto.reconciliationNote === undefined
          ? null
          : dto.reconciliationNote?.trim() || null;
      data.reconciliationReviewedAt = new Date();

      if (
        dto.reconciliationStatus ===
        ImportedMovementReconciliationStatus.CONFIRMED_DUPLICATE
      ) {
        data.status = ImportedMovementStatus.IGNORED;
      } else if (
        movement.status === ImportedMovementStatus.IGNORED &&
        dto.reconciliationStatus ===
          ImportedMovementReconciliationStatus.CONFIRMED_UNIQUE &&
        !hasReviewDataChanges
      ) {
        data.status = ImportedMovementStatus.NEEDS_REVIEW;
      }
    } else if (dto.reconciliationNote !== undefined) {
      data.reconciliationNote = dto.reconciliationNote?.trim() || null;
    }

    return this.prisma.importedMovement.update({
      where: {
        id: movement.id,
      },
      data,
      select: {
        id: true,
        date: true,
        direction: true,
        amountCents: true,
        rawType: true,
        rawDescription: true,
        normalizedDescription: true,
        sourcePage: true,
        sourceLine: true,
        fingerprint: true,
        externalId: true,
        status: true,
        reviewTarget: true,
        reviewCategoryId: true,
        reviewCategory: {
          select: REVIEW_CATEGORY_SELECT,
        },
        reviewTransferAccountId: true,
        reviewTransferAccount: {
          select: FINANCIAL_ACCOUNT_SELECT,
        },
        reconciliationStatus: true,
        reconciliationNote: true,
        reconciliationReviewedAt: true,
        appliedTransactionId: true,
        appliedTransferId: true,
        appliedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateMovementStatus(
    userId: string,
    movementId: string,
    status: ReviewableImportedMovementStatus,
  ) {
    const movement = await this.prisma.importedMovement.findFirst({
      where: {
        id: movementId,
        userId,
      },
      select: {
        id: true,
        status: true,
        date: true,
        direction: true,
        amountCents: true,
        rawType: true,
        rawDescription: true,
        reviewTarget: true,
        reviewCategoryId: true,
        reviewTransferAccountId: true,
        reconciliationStatus: true,
        file: {
          select: {
            financialAccountId: true,
          },
        },
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimento importado não encontrado.');
    }

    if (movement.status === 'APPLIED') {
      throw new BadRequestException(
        'Movimentos já aplicados não podem ser revisados.',
      );
    }

    if (status === ImportedMovementStatus.READY) {
      await this.assertMovementReady(userId, movement);
    }

    return this.prisma.importedMovement.update({
      where: {
        id: movement.id,
      },
      data: {
        status,
      },
      select: {
        id: true,
        date: true,
        direction: true,
        amountCents: true,
        rawType: true,
        rawDescription: true,
        normalizedDescription: true,
        sourcePage: true,
        sourceLine: true,
        fingerprint: true,
        externalId: true,
        status: true,
        reviewTarget: true,
        reviewCategoryId: true,
        reviewCategory: {
          select: REVIEW_CATEGORY_SELECT,
        },
        reviewTransferAccountId: true,
        reviewTransferAccount: {
          select: FINANCIAL_ACCOUNT_SELECT,
        },
        reconciliationStatus: true,
        reconciliationNote: true,
        reconciliationReviewedAt: true,
        appliedTransactionId: true,
        appliedTransferId: true,
        appliedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async applyReadyMovements(userId: string, batchId: string) {
    const batch = await this.prisma.statementImportBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      select: STATEMENT_IMPORT_BATCH_SELECT,
    });

    if (!batch) {
      throw new NotFoundException('Lote de importação não encontrado.');
    }

    const readyMovements = batch.files.flatMap((file) =>
      file.movements
        .filter((movement) => movement.status === ImportedMovementStatus.READY)
        .map((movement) => ({
          file,
          movement,
        })),
    );

    if (readyMovements.length === 0) {
      throw new BadRequestException(
        'Nenhum movimento pronto para aplicar neste lote.',
      );
    }

    for (const { file, movement } of readyMovements) {
      await this.assertMovementReady(userId, {
        date: movement.date,
        amountCents: movement.amountCents,
        direction: movement.direction,
        rawType: movement.rawType,
        rawDescription: movement.rawDescription,
        reviewTarget: movement.reviewTarget,
        reviewCategoryId: movement.reviewCategoryId,
        reviewTransferAccountId: movement.reviewTransferAccountId,
        reconciliationStatus: movement.reconciliationStatus,
        file: {
          financialAccountId: file.financialAccountId,
        },
      });
    }

    const summary = await this.prisma.$transaction(async (tx) => {
      let transactionCount = 0;
      let transferCount = 0;

      for (const { file, movement } of readyMovements) {
        if (!file.financialAccountId) {
          throw new BadRequestException(
            'Movimento pronto precisa ter conta financeira do extrato.',
          );
        }

        const reviewTarget =
          movement.reviewTarget ?? ImportedMovementReviewTarget.TRANSACTION;

        if (reviewTarget === ImportedMovementReviewTarget.TRANSFER) {
          if (!movement.reviewTransferAccountId) {
            throw new BadRequestException(
              'Transferência pronta precisa ter a outra conta informada.',
            );
          }

          const transfer = await tx.transfer.create({
            data: {
              amount: centsToDecimal(movement.amountCents),
              date: movement.date,
              isPending: false,
              description: movement.rawDescription,
              fromAccountId:
                movement.direction === 'OUT'
                  ? file.financialAccountId
                  : movement.reviewTransferAccountId,
              toAccountId:
                movement.direction === 'OUT'
                  ? movement.reviewTransferAccountId
                  : file.financialAccountId,
              userId,
            },
            select: {
              id: true,
            },
          });

          const updated = await tx.importedMovement.updateMany({
            where: {
              id: movement.id,
              userId,
              status: ImportedMovementStatus.READY,
            },
            data: {
              status: ImportedMovementStatus.APPLIED,
              appliedTransferId: transfer.id,
              appliedTransactionId: null,
              appliedAt: new Date(),
            },
          });

          if (updated.count !== 1) {
            throw new BadRequestException(
              'Movimento pronto já foi alterado antes da aplicação.',
            );
          }

          transferCount += 1;
          continue;
        }

        if (!movement.reviewCategoryId) {
          throw new BadRequestException(
            'Transação pronta precisa ter categoria revisada.',
          );
        }

        const transaction = await tx.transaction.create({
          data: {
            type: reviewTypeToTransactionType(
              movement.direction,
              movement.rawType,
            ),
            amount: centsToDecimal(movement.amountCents),
            date: movement.date,
            isPending: false,
            description: movement.rawDescription,
            categoryId: movement.reviewCategoryId,
            financialAccountId: file.financialAccountId,
            userId,
          },
          select: {
            id: true,
          },
        });

        const updated = await tx.importedMovement.updateMany({
          where: {
            id: movement.id,
            userId,
            status: ImportedMovementStatus.READY,
          },
          data: {
            status: ImportedMovementStatus.APPLIED,
            appliedTransactionId: transaction.id,
            appliedTransferId: null,
            appliedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          throw new BadRequestException(
            'Movimento pronto já foi alterado antes da aplicação.',
          );
        }

        transactionCount += 1;
      }

      const statuses = await tx.importedMovement.findMany({
        where: {
          file: {
            batchId,
            userId,
          },
        },
        select: {
          status: true,
        },
      });
      const batchStatus = nextBatchStatusAfterApply(
        statuses.map((movement) => movement.status),
      );

      await tx.statementImportBatch.update({
        where: {
          id: batchId,
        },
        data: {
          status: batchStatus,
        },
        select: {
          id: true,
        },
      });

      return {
        appliedCount: transactionCount + transferCount,
        transactionCount,
        transferCount,
        batchStatus,
      };
    });

    return {
      ...summary,
      batch: await this.findBatch(userId, batchId),
    };
  }

  async undoAppliedMovements(
    userId: string,
    batchId: string,
    selectedMovementIds?: string[],
  ) {
    const batch = await this.prisma.statementImportBatch.findFirst({
      where: {
        id: batchId,
        userId,
      },
      select: STATEMENT_IMPORT_BATCH_SELECT,
    });

    if (!batch) {
      throw new NotFoundException('Lote de importação não encontrado.');
    }

    const requestedMovementIds = selectedMovementIds
      ? [...new Set(selectedMovementIds)]
      : undefined;

    if (requestedMovementIds && requestedMovementIds.length === 0) {
      throw new BadRequestException(
        'Selecione ao menos um movimento aplicado para desfazer.',
      );
    }

    const allAppliedMovements = batch.files.flatMap((file) =>
      file.movements.filter(
        (movement) => movement.status === ImportedMovementStatus.APPLIED,
      ),
    );
    const appliedMovements = requestedMovementIds
      ? allAppliedMovements.filter((movement) =>
          requestedMovementIds.includes(movement.id),
        )
      : allAppliedMovements;

    if (appliedMovements.length === 0) {
      throw new BadRequestException(
        'Nenhum movimento aplicado para desfazer neste lote.',
      );
    }

    if (
      requestedMovementIds &&
      appliedMovements.length !== requestedMovementIds.length
    ) {
      throw new BadRequestException(
        'Alguns movimentos selecionados não estão aplicados neste lote.',
      );
    }

    const movementIds = appliedMovements.map((movement) => movement.id);
    const transactionIds = [
      ...new Set(
        appliedMovements.flatMap((movement) =>
          movement.appliedTransactionId ? [movement.appliedTransactionId] : [],
        ),
      ),
    ];
    const transferIds = [
      ...new Set(
        appliedMovements.flatMap((movement) =>
          movement.appliedTransferId ? [movement.appliedTransferId] : [],
        ),
      ),
    ];

    if (transactionIds.length + transferIds.length === 0) {
      throw new BadRequestException(
        'Movimentos aplicados não possuem vínculo rastreável para desfazer.',
      );
    }

    const summary = await this.prisma.$transaction(async (tx) => {
      if (transactionIds.length > 0) {
        const deletedTransactions = await tx.transaction.deleteMany({
          where: {
            id: { in: transactionIds },
            userId,
          },
        });

        if (deletedTransactions.count !== transactionIds.length) {
          throw new BadRequestException(
            'Não foi possível desfazer todas as transações vinculadas ao lote.',
          );
        }
      }

      if (transferIds.length > 0) {
        const deletedTransfers = await tx.transfer.deleteMany({
          where: {
            id: { in: transferIds },
            userId,
          },
        });

        if (deletedTransfers.count !== transferIds.length) {
          throw new BadRequestException(
            'Não foi possível desfazer todas as transferências vinculadas ao lote.',
          );
        }
      }

      const updatedMovements = await tx.importedMovement.updateMany({
        where: {
          id: { in: movementIds },
          userId,
          status: ImportedMovementStatus.APPLIED,
        },
        data: {
          status: ImportedMovementStatus.READY,
          appliedTransactionId: null,
          appliedTransferId: null,
          appliedAt: null,
        },
      });

      if (updatedMovements.count !== movementIds.length) {
        throw new BadRequestException(
          'Alguns movimentos aplicados foram alterados antes do desfazer.',
        );
      }

      const statuses = await tx.importedMovement.findMany({
        where: {
          file: {
            batchId,
            userId,
          },
        },
        select: {
          status: true,
        },
      });
      const batchStatus = nextBatchStatusAfterApply(
        statuses.map((movement) => movement.status),
      );

      await tx.statementImportBatch.update({
        where: {
          id: batchId,
        },
        data: {
          status: batchStatus,
        },
        select: {
          id: true,
        },
      });

      return {
        undoneCount: movementIds.length,
        transactionCount: transactionIds.length,
        transferCount: transferIds.length,
        batchStatus,
      };
    });

    return {
      ...summary,
      batch: await this.findBatch(userId, batchId),
    };
  }
}
