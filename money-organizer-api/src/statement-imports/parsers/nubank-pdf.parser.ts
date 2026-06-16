import { createHash } from 'crypto';
import {
  ParsedStatement,
  ParsedStatementDirection,
  ParsedStatementMovement,
} from '../types';
import { PdfTextExtractor, PdfTextRow } from './pdf-text-extractor';
import { StatementParser } from './statement-parser';

const FULL_MONTHS: Record<string, string> = {
  JANEIRO: '01',
  FEVEREIRO: '02',
  MARCO: '03',
  MARÇO: '03',
  ABRIL: '04',
  MAIO: '05',
  JUNHO: '06',
  JULHO: '07',
  AGOSTO: '08',
  SETEMBRO: '09',
  OUTUBRO: '10',
  NOVEMBRO: '11',
  DEZEMBRO: '12',
};

const SHORT_MONTHS: Record<string, string> = {
  JAN: '01',
  FEV: '02',
  MAR: '03',
  ABR: '04',
  MAI: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  SET: '09',
  OUT: '10',
  NOV: '11',
  DEZ: '12',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIsoDate(day: string, month: string, year: string): string | undefined {
  const monthNumber = FULL_MONTHS[month] ?? SHORT_MONTHS[month];

  if (!monthNumber) {
    return undefined;
  }

  return `${year}-${monthNumber}-${day.padStart(2, '0')}`;
}

function parseStatementPeriod(rows: PdfTextRow[]) {
  const allText = normalizeText(rows.map((row) => row.text).join(' ')).toUpperCase();
  const match = allText.match(
    /(\d{2}) DE ([A-ZÇ]+) DE (\d{4}) A (\d{2}) DE ([A-ZÇ]+) DE (\d{4})/,
  );

  if (!match) {
    return {};
  }

  return {
    periodStart: toIsoDate(match[1], match[2], match[3]),
    periodEnd: toIsoDate(match[4], match[5], match[6]),
  };
}

function parseShortDate(value: string): string | undefined {
  const match = normalizeText(value).toUpperCase().match(/^(\d{2}) ([A-Z]{3}) (\d{4})$/);

  if (!match) {
    return undefined;
  }

  return toIsoDate(match[1], match[2], match[3]);
}

function parseMoneyCents(value: string): number | undefined {
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/[R$]/g, '')
    .trim();
  const match = normalized.match(/^([+-]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);

  if (!match) {
    return undefined;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const integerPart = match[2].replace(/\./g, '');
  const decimalPart = match[3];

  return sign * (Number(integerPart) * 100 + Number(decimalPart));
}

function lastMoneyInRow(row?: PdfTextRow): number | undefined {
  if (!row) {
    return undefined;
  }

  for (let index = row.elements.length - 1; index >= 0; index -= 1) {
    const amount = parseMoneyCents(row.elements[index].text);

    if (amount !== undefined) {
      return amount;
    }
  }

  return undefined;
}

function findValueByLabel(rows: PdfTextRow[], label: string): number | undefined {
  const normalizedLabel = normalizeText(label).toUpperCase();
  const row = rows.find((entry) => {
    const startsWithLabel = normalizeText(entry.text)
      .toUpperCase()
      .startsWith(normalizedLabel);

    return startsWithLabel && lastMoneyInRow(entry) !== undefined;
  });

  return lastMoneyInRow(row);
}

function getAccountNumber(rows: PdfTextRow[]): string | undefined {
  return rows
    .flatMap((row) => row.elements)
    .map((element) => element.text.trim())
    .find((text) => /^\d{6,}-\d$/.test(text));
}

function inferDirection(
  rawType: string,
  currentDirection?: ParsedStatementDirection,
): ParsedStatementDirection {
  const normalizedType = normalizeText(rawType).toUpperCase();

  if (
    normalizedType.includes('RECEBIDA') ||
    normalizedType.includes('DEPOSITO') ||
    normalizedType.includes('RENDIMENTO')
  ) {
    return 'IN';
  }

  if (
    normalizedType.includes('ENVIADA') ||
    normalizedType.includes('PAGAMENTO') ||
    normalizedType.includes('COMPRA') ||
    normalizedType.includes('SAIDA')
  ) {
    return 'OUT';
  }

  return currentDirection ?? 'OUT';
}

function buildFingerprint(
  accountNumber: string | undefined,
  movement: Omit<ParsedStatementMovement, 'fingerprint'>,
) {
  return createHash('sha256')
    .update(
      [
        'NUBANK',
        accountNumber ?? '',
        movement.date,
        movement.direction,
        movement.amountCents,
        normalizeText(movement.rawType).toUpperCase(),
        movement.normalizedDescription,
      ].join('|'),
    )
    .digest('hex');
}

function isFooterOrHeaderRow(row: PdfTextRow): boolean {
  const text = normalizeText(row.text).toUpperCase();

  return (
    text.includes('DIOGO BAZZANELLA') ||
    text === 'CPF' ||
    text.includes('AGENCIA 0001') ||
    text.includes('CONTA 47085206-7') ||
    text.includes('VALORES EM R$') ||
    text.includes('NU PAGAMENTOS S.A.') ||
    text.includes('NU FINANCEIRA S.A.') ||
    text.startsWith('CNPJ:') ||
    text === 'INVESTIMENTO' ||
    text.includes('EXTRATO GERADO') ||
    text.includes('TEM ALGUMA DUVIDA') ||
    text.includes('OUVIDORIA') ||
    text.includes('NUBANK.COM.BR') ||
    text.includes('NAO NOS RESPONSABILIZAMOS') ||
    text.includes('ASSEGURAMOS A AUTENTICIDADE') ||
    text.includes('SALDO LIQUIDO CORRESPONDE')
  );
}

export class NubankPdfParser implements StatementParser {
  readonly priority = 30;
  readonly label = 'Nubank PDF';

  private readonly extractor = new PdfTextExtractor();

  canParse(fileName: string, mimeType: string) {
    return (
      mimeType === 'application/pdf' ||
      fileName.toLowerCase().endsWith('.pdf')
    );
  }

  parse(buffer: Buffer): ParsedStatement {
    const rows = this.extractor.extractRows(buffer);
    const { periodStart, periodEnd } = parseStatementPeriod(rows);
    const accountNumber = getAccountNumber(rows);
    const movements = this.parseMovements(rows, accountNumber);

    return {
      provider: 'NUBANK',
      sourceType: 'PDF',
      accountNumber,
      periodStart,
      periodEnd,
      summary: {
        openingBalanceCents: findValueByLabel(rows, 'Saldo inicial'),
        closingBalanceCents: findValueByLabel(rows, 'Saldo final do periodo'),
        totalInCents: findValueByLabel(rows, 'Total de entradas'),
        totalOutCents: Math.abs(findValueByLabel(rows, 'Total de saidas') ?? 0),
      },
      movements,
      warnings: movements.length === 0
        ? ['Nenhuma movimentacao foi identificada no PDF enviado.']
        : [],
    };
  }

  private parseMovements(
    rows: PdfTextRow[],
    accountNumber?: string,
  ): ParsedStatementMovement[] {
    const movements: ParsedStatementMovement[] = [];
    let inMovementSection = false;
    let currentDate: string | undefined;
    let currentDirection: ParsedStatementDirection | undefined;
    let pending:
      | (Omit<ParsedStatementMovement, 'fingerprint' | 'rawDescription' | 'normalizedDescription'> & {
          descriptionParts: string[];
        })
      | null = null;

    const flushPending = () => {
      if (!pending) {
        return;
      }

      const rawDescription = pending.descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
      const normalizedDescription = normalizeText(rawDescription).toUpperCase();
      const movement = {
        date: pending.date,
        amountCents: pending.amountCents,
        direction: pending.direction,
        rawType: pending.rawType,
        rawDescription,
        normalizedDescription,
        sourcePage: pending.sourcePage,
        sourceLine: pending.sourceLine,
      };

      movements.push({
        ...movement,
        fingerprint: buildFingerprint(accountNumber, movement),
      });
      pending = null;
    };

    for (const row of rows) {
      const normalizedRow = normalizeText(row.text).toUpperCase();

      if (normalizedRow === 'MOVIMENTACOES') {
        inMovementSection = true;
        continue;
      }

      if (!inMovementSection) {
        continue;
      }

      const rowDate = parseShortDate(row.elements[0]?.text ?? '');

      if (rowDate) {
        flushPending();
        currentDate = rowDate;
        currentDirection = undefined;
        continue;
      }

      if (normalizedRow.includes('TOTAL DE ENTRADAS')) {
        flushPending();
        currentDirection = 'IN';
        continue;
      }

      if (normalizedRow.includes('TOTAL DE SAIDAS')) {
        flushPending();
        currentDirection = 'OUT';
        continue;
      }

      const typeElement = row.elements.find(
        (element) => element.x >= 100 && element.x < 230,
      );
      const amountElement = [...row.elements]
        .reverse()
        .find((element) => element.x >= 470 && parseMoneyCents(element.text) !== undefined);
      const amountCents = amountElement ? parseMoneyCents(amountElement.text) : undefined;

      if (currentDate && typeElement && amountCents !== undefined) {
        flushPending();
        const descriptionParts = row.elements
          .filter((element) => element.x >= 230 && element.x < 470)
          .map((element) => element.text);

        pending = {
          date: currentDate,
          amountCents: Math.abs(amountCents),
          direction: inferDirection(typeElement.text, currentDirection),
          rawType: typeElement.text,
          descriptionParts,
          sourcePage: row.page,
          sourceLine: row.line,
        };
        continue;
      }

      if (pending && row.page === pending.sourcePage && !isFooterOrHeaderRow(row)) {
        const continuation = row.elements
          .filter((element) => element.x >= 230)
          .map((element) => element.text)
          .join(' ')
          .trim();

        if (continuation) {
          pending.descriptionParts.push(continuation);
        }
      }
    }

    flushPending();

    return movements;
  }
}
