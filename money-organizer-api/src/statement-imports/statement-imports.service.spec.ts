import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ImportedMovementStatus,
  ImportedMovementReconciliationStatus,
  ImportedMovementReviewTarget,
  Prisma,
  TransactionType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { NubankPdfParser } from './parsers/nubank-pdf.parser';
import { OfxParser } from './parsers/ofx.parser';
import { StatementImportsService } from './statement-imports.service';

type ParserMock = {
  priority: number;
  label: string;
  canParse: jest.Mock;
  parse: jest.Mock;
};

function mockStatementParser(priority: number, label: string): ParserMock {
  return {
    priority,
    label,
    canParse: jest.fn(),
    parse: jest.fn(),
  };
}

describe('StatementImportsService', () => {
  let service: StatementImportsService;
  let ofxParser: ParserMock;
  let csvStatementParser: ParserMock;
  let nubankPdfParser: ParserMock;
  let prisma: {
    $transaction: jest.Mock;
    statementImportBatch: {
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    transaction: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    transfer: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    balanceAdjustment: {
      findMany: jest.Mock;
    };
    financialAccount: {
      findFirst: jest.Mock;
    };
    category: {
      findFirst: jest.Mock;
    };
    importedMovement: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    ofxParser = mockStatementParser(10, 'OFX');
    csvStatementParser = mockStatementParser(20, 'CSV/TSV');
    nubankPdfParser = mockStatementParser(30, 'Nubank PDF');

    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      statementImportBatch: {
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      transfer: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      balanceAdjustment: {
        findMany: jest.fn(),
      },
      financialAccount: {
        findFirst: jest.fn(),
      },
      category: {
        findFirst: jest.fn(),
      },
      importedMovement: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transfer.findMany.mockResolvedValue([]);
    prisma.balanceAdjustment.findMany.mockResolvedValue([]);
    prisma.importedMovement.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatementImportsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: OfxParser,
          useValue: ofxParser,
        },
        {
          provide: CsvStatementParser,
          useValue: csvStatementParser,
        },
        {
          provide: NubankPdfParser,
          useValue: nubankPdfParser,
        },
      ],
    }).compile();

    service = module.get<StatementImportsService>(StatementImportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('selects the parser by priority when multiple parsers accept a file', async () => {
    const buffer = Buffer.from('ambiguous statement');
    ofxParser.priority = 30;
    csvStatementParser.priority = 10;
    nubankPdfParser.priority = 20;
    ofxParser.canParse.mockReturnValue(true);
    csvStatementParser.canParse.mockReturnValue(true);
    nubankPdfParser.canParse.mockReturnValue(true);
    csvStatementParser.parse.mockReturnValue({
      provider: 'UNKNOWN',
      sourceType: 'CSV',
      movements: [],
      warnings: [],
    });

    await expect(
      service.preview('user-1', {
        originalname: 'ambiguous.statement',
        mimetype: 'text/plain',
        size: buffer.length,
        buffer,
      }),
    ).resolves.toMatchObject({
      sourceType: 'CSV',
      warnings: [],
    });

    expect(csvStatementParser.canParse).toHaveBeenCalledWith(
      'ambiguous.statement',
      'text/plain',
      buffer,
    );
    expect(csvStatementParser.parse).toHaveBeenCalledWith(
      buffer,
      'ambiguous.statement',
    );
    expect(nubankPdfParser.canParse).not.toHaveBeenCalled();
    expect(ofxParser.canParse).not.toHaveBeenCalled();
  });

  it('updates an imported movement status scoped to the user', async () => {
    const updatedMovement = {
      id: 'movement-1',
      status: ImportedMovementStatus.IGNORED,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      date: new Date(2026, 5, 15, 12),
      direction: 'OUT',
      amountCents: 12990,
      rawType: 'DEBITO',
      rawDescription: 'Compra no debito',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: null,
      reviewTransferAccountId: null,
      reconciliationStatus: ImportedMovementReconciliationStatus.PENDING,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.IGNORED,
      ),
    ).resolves.toBe(updatedMovement);

    expect(prisma.importedMovement.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'movement-1',
        userId: 'user-1',
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
    expect(prisma.importedMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'movement-1',
        },
        data: {
          status: ImportedMovementStatus.IGNORED,
        },
      }),
    );
  });

  it('edits reviewable imported movement fields and sends it back to review', async () => {
    const updatedMovement = {
      id: 'movement-1',
      date: new Date(2026, 5, 15, 12),
      amountCents: 12990,
      direction: 'IN',
      rawType: 'PIX',
      rawDescription: 'Pix recebido de cliente',
      normalizedDescription: 'PIX RECEBIDO DE CLIENTE',
      status: ImportedMovementStatus.NEEDS_REVIEW,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
    });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovement('user-1', 'movement-1', {
        date: '2026-06-15',
        amountCents: 12990,
        direction: 'IN',
        rawType: '  PIX  ',
        rawDescription: '  Pix recebido de cliente  ',
      }),
    ).resolves.toBe(updatedMovement);

    expect(prisma.importedMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'movement-1',
        },
        data: expect.objectContaining({
          date: new Date(2026, 5, 15, 12),
          amountCents: 12990,
          direction: 'IN',
          rawType: 'PIX',
          rawDescription: 'Pix recebido de cliente',
          normalizedDescription: 'PIX RECEBIDO DE CLIENTE',
          reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
          reviewTransferAccount: {
            disconnect: true,
          },
          status: ImportedMovementStatus.NEEDS_REVIEW,
        }),
      }),
    );
  });

  it('rejects transaction review types that are invalid for income movements', async () => {
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      direction: 'OUT',
      rawType: 'DEBITO',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewTransferAccountId: null,
      file: {
        financialAccountId: 'account-1',
      },
    });

    await expect(
      service.updateMovement('user-1', 'movement-1', {
        direction: 'IN',
        rawType: 'CREDITO',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.importedMovement.update).not.toHaveBeenCalled();
  });

  it('stores a reviewed category for transaction review intent', async () => {
    const updatedMovement = {
      id: 'movement-1',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: 'category-1',
      status: ImportedMovementStatus.NEEDS_REVIEW,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      direction: 'OUT',
      rawType: 'DEBITO',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: null,
      reviewTransferAccountId: null,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.category.findFirst.mockResolvedValue({
      id: 'category-1',
    });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovement('user-1', 'movement-1', {
        reviewCategoryId: 'category-1',
      }),
    ).resolves.toBe(updatedMovement);

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        userId: 'user-1',
        isArchived: false,
      },
      select: {
        id: true,
      },
    });
    expect(prisma.importedMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
          reviewCategory: {
            connect: {
              id: 'category-1',
            },
          },
          reviewTransferAccount: {
            disconnect: true,
          },
          status: ImportedMovementStatus.NEEDS_REVIEW,
        }),
      }),
    );
  });

  it('does not mark transaction review as ready without a reviewed category', async () => {
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      direction: 'OUT',
      amountCents: 12990,
      rawType: 'DEBITO',
      rawDescription: 'Compra no debito',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: null,
      reviewTransferAccountId: null,
      file: {
        financialAccountId: 'account-1',
      },
    });

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.READY,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.importedMovement.update).not.toHaveBeenCalled();
  });

  it('marks transaction review as ready after category validation', async () => {
    const updatedMovement = {
      id: 'movement-1',
      status: ImportedMovementStatus.READY,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      date: new Date(2026, 5, 15, 12),
      direction: 'OUT',
      amountCents: 12990,
      rawType: 'DEBITO',
      rawDescription: 'Compra no debito',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: 'category-1',
      reviewTransferAccountId: null,
      reconciliationStatus: ImportedMovementReconciliationStatus.PENDING,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.category.findFirst.mockResolvedValue({
      id: 'category-1',
    });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.READY,
      ),
    ).resolves.toBe(updatedMovement);

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        userId: 'user-1',
        isArchived: false,
      },
      select: {
        id: true,
      },
    });
  });

  it('does not mark a movement as ready when a ledger match still needs reconciliation', async () => {
    const movementDate = new Date(2026, 5, 15, 12);
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      date: movementDate,
      direction: 'OUT',
      amountCents: 12990,
      rawType: 'DEBITO',
      rawDescription: 'Compra no debito',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: 'category-1',
      reviewTransferAccountId: null,
      reconciliationStatus: ImportedMovementReconciliationStatus.PENDING,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        id: 'transaction-1',
        type: TransactionType.DEBIT,
        amount: new Prisma.Decimal(129.9),
        date: movementDate,
        description: 'Compra no debito',
        category: {
          name: 'Mercado',
        },
      },
    ]);

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.READY,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.importedMovement.update).not.toHaveBeenCalled();
  });

  it('marks a reconciled unique movement as ready even when a ledger match exists', async () => {
    const movementDate = new Date(2026, 5, 15, 12);
    const updatedMovement = {
      id: 'movement-1',
      status: ImportedMovementStatus.READY,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      date: movementDate,
      direction: 'OUT',
      amountCents: 12990,
      rawType: 'DEBITO',
      rawDescription: 'Compra no debito',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: 'category-1',
      reviewTransferAccountId: null,
      reconciliationStatus:
        ImportedMovementReconciliationStatus.CONFIRMED_UNIQUE,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        id: 'transaction-1',
        type: TransactionType.DEBIT,
        amount: new Prisma.Decimal(129.9),
        date: movementDate,
        description: 'Compra no debito',
        category: {
          name: 'Mercado',
        },
      },
    ]);
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.READY,
      ),
    ).resolves.toBe(updatedMovement);

    expect(prisma.importedMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: ImportedMovementStatus.READY,
        },
      }),
    );
  });

  it('stores transfer review intent with the other active account', async () => {
    const updatedMovement = {
      id: 'movement-1',
      reviewTarget: ImportedMovementReviewTarget.TRANSFER,
      reviewTransferAccountId: 'account-2',
      rawType: 'TRANSFERENCIA',
      status: ImportedMovementStatus.NEEDS_REVIEW,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      direction: 'OUT',
      rawType: 'DEBITO',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewTransferAccountId: null,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.financialAccount.findFirst.mockResolvedValue({
      id: 'account-2',
    });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovement('user-1', 'movement-1', {
        reviewTarget: ImportedMovementReviewTarget.TRANSFER,
        reviewTransferAccountId: 'account-2',
      }),
    ).resolves.toBe(updatedMovement);

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-2',
        userId: 'user-1',
        isArchived: false,
      },
      select: {
        id: true,
      },
    });
    expect(prisma.importedMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewTarget: ImportedMovementReviewTarget.TRANSFER,
          reviewTransferAccount: {
            connect: {
              id: 'account-2',
            },
          },
          rawType: 'TRANSFERENCIA',
          status: ImportedMovementStatus.NEEDS_REVIEW,
        }),
      }),
    );
  });

  it('stores a duplicate reconciliation decision and ignores the imported movement', async () => {
    const updatedMovement = {
      id: 'movement-1',
      reconciliationStatus:
        ImportedMovementReconciliationStatus.CONFIRMED_DUPLICATE,
      status: ImportedMovementStatus.IGNORED,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEW,
      direction: 'OUT',
      rawType: 'DEBITO',
      reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      reviewCategoryId: 'category-1',
      reviewTransferAccountId: null,
      reconciliationStatus: ImportedMovementReconciliationStatus.PENDING,
      file: {
        financialAccountId: 'account-1',
      },
    });
    prisma.importedMovement.update.mockResolvedValue(updatedMovement);

    await expect(
      service.updateMovement('user-1', 'movement-1', {
        reconciliationStatus:
          ImportedMovementReconciliationStatus.CONFIRMED_DUPLICATE,
      }),
    ).resolves.toBe(updatedMovement);

    expect(prisma.importedMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reconciliationStatus:
            ImportedMovementReconciliationStatus.CONFIRMED_DUPLICATE,
          reconciliationNote: null,
          reconciliationReviewedAt: expect.any(Date),
          status: ImportedMovementStatus.IGNORED,
        }),
      }),
    );
  });

  it('applies ready reviewed transaction movements and keeps audit link', async () => {
    const movementDate = new Date(2026, 5, 15, 12);
    jest.spyOn(service, 'findBatch').mockResolvedValue({
      id: 'batch-1',
    } as any);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              status: ImportedMovementStatus.READY,
              date: movementDate,
              direction: 'OUT',
              amountCents: 12990,
              rawType: 'DEBITO',
              rawDescription: 'Compra no debito',
              reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
              reviewCategoryId: 'category-1',
              reviewTransferAccountId: null,
              reconciliationStatus:
                ImportedMovementReconciliationStatus.PENDING,
            },
          ],
        },
      ],
    });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.transaction.create.mockResolvedValue({ id: 'transaction-1' });
    prisma.importedMovement.updateMany.mockResolvedValue({ count: 1 });
    prisma.importedMovement.findMany.mockResolvedValue([
      { status: ImportedMovementStatus.APPLIED },
    ]);
    prisma.statementImportBatch.update.mockResolvedValue({ id: 'batch-1' });

    await expect(
      service.applyReadyMovements('user-1', 'batch-1'),
    ).resolves.toMatchObject({
      appliedCount: 1,
      transactionCount: 1,
      transferCount: 0,
      batchStatus: 'APPLIED',
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: TransactionType.DEBIT,
        date: movementDate,
        isPending: false,
        description: 'Compra no debito',
        categoryId: 'category-1',
        financialAccountId: 'account-1',
        userId: 'user-1',
      }),
      select: { id: true },
    });
    expect(
      prisma.transaction.create.mock.calls[0][0].data.amount.toString(),
    ).toBe('129.9');
    expect(prisma.importedMovement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'movement-1',
        userId: 'user-1',
        status: ImportedMovementStatus.READY,
      },
      data: {
        status: ImportedMovementStatus.APPLIED,
        appliedTransactionId: 'transaction-1',
        appliedTransferId: null,
        appliedAt: expect.any(Date),
      },
    });
  });

  it('applies ready reviewed transfer movements as one transfer', async () => {
    const movementDate = new Date(2026, 5, 15, 12);
    jest.spyOn(service, 'findBatch').mockResolvedValue({
      id: 'batch-1',
    } as any);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              status: ImportedMovementStatus.READY,
              date: movementDate,
              direction: 'IN',
              amountCents: 5000,
              rawType: 'TRANSFERENCIA',
              rawDescription: 'Transferencia entre contas',
              reviewTarget: ImportedMovementReviewTarget.TRANSFER,
              reviewCategoryId: null,
              reviewTransferAccountId: 'account-2',
              reconciliationStatus:
                ImportedMovementReconciliationStatus.PENDING,
            },
          ],
        },
      ],
    });
    prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-2' });
    prisma.transfer.create.mockResolvedValue({ id: 'transfer-1' });
    prisma.importedMovement.updateMany.mockResolvedValue({ count: 1 });
    prisma.importedMovement.findMany.mockResolvedValue([
      { status: ImportedMovementStatus.APPLIED },
    ]);
    prisma.statementImportBatch.update.mockResolvedValue({ id: 'batch-1' });

    await expect(
      service.applyReadyMovements('user-1', 'batch-1'),
    ).resolves.toMatchObject({
      appliedCount: 1,
      transactionCount: 0,
      transferCount: 1,
      batchStatus: 'APPLIED',
    });

    expect(prisma.transfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date: movementDate,
        isPending: false,
        description: 'Transferencia entre contas',
        fromAccountId: 'account-2',
        toAccountId: 'account-1',
        userId: 'user-1',
      }),
      select: { id: true },
    });
    expect(prisma.importedMovement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'movement-1',
        userId: 'user-1',
        status: ImportedMovementStatus.READY,
      },
      data: {
        status: ImportedMovementStatus.APPLIED,
        appliedTransferId: 'transfer-1',
        appliedTransactionId: null,
        appliedAt: expect.any(Date),
      },
    });
  });

  it('does not apply a batch without ready movements', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              status: ImportedMovementStatus.NEEDS_REVIEW,
            },
          ],
        },
      ],
    });

    await expect(
      service.applyReadyMovements('user-1', 'batch-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });

  it('adds read-only review hints when loading a persisted batch', async () => {
    const movementDate = new Date(2026, 1, 21, 12);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'REVIEWING',
      createdAt: new Date(2026, 1, 21, 13),
      updatedAt: new Date(2026, 1, 21, 13),
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              date: movementDate,
              direction: 'OUT',
              amountCents: 5000,
              rawDescription: 'Transferencia enviada pelo Pix - LIVEPIX',
              normalizedDescription: 'TRANSFERENCIA ENVIADA PELO PIX LIVEPIX',
              reconciliationStatus:
                ImportedMovementReconciliationStatus.PENDING,
            },
          ],
        },
      ],
    });
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: 'transaction-1',
          type: TransactionType.DEBIT,
          amount: new Prisma.Decimal(50),
          date: movementDate,
          description: 'LivePix pagamento',
          financialAccountId: 'account-1',
          category: {
            id: 'category-1',
            name: 'Doacoes',
            icon: null,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          description: 'TRANSFERENCIA ENVIADA PELO PIX LIVEPIX',
          category: {
            id: 'category-1',
            name: 'Doacoes',
            icon: null,
          },
        },
      ]);
    prisma.transfer.findMany.mockResolvedValue([]);
    prisma.balanceAdjustment.findMany.mockResolvedValue([]);

    const batch = await service.findBatch('user-1', 'batch-1');
    const hints = (batch.files[0].movements[0] as any).reviewHints;

    expect(hints.reconciliationMatches[0]).toMatchObject({
      sourceType: 'TRANSACTION',
      sourceId: 'transaction-1',
      amountCents: 5000,
      direction: 'OUT',
    });
    expect(hints.categorySuggestion).toMatchObject({
      categoryId: 'category-1',
      categoryName: 'Doacoes',
      basedOnCount: 1,
    });
    expect(hints.flags).toEqual(
      expect.arrayContaining([
        'POSSIBLE_LEDGER_MATCH',
        'RECONCILIATION_REQUIRED',
        'PIX_REQUIRES_MANUAL_TRANSFER_REVIEW',
      ]),
    );
    expect(prisma.statementImportBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'batch-1',
          userId: 'user-1',
        },
      }),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(2);
  });

  it('removes a non-applied import batch scoped to the user', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
    });
    prisma.importedMovement.count.mockResolvedValue(0);
    prisma.statementImportBatch.delete.mockResolvedValue({
      id: 'batch-1',
    });

    await expect(service.removeBatch('user-1', 'batch-1')).resolves.toEqual({
      message: 'Lote de importacao excluido com sucesso.',
    });

    expect(prisma.statementImportBatch.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'batch-1',
        userId: 'user-1',
      },
      select: {
        id: true,
      },
    });
    expect(prisma.importedMovement.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: ImportedMovementStatus.APPLIED,
        file: {
          batchId: 'batch-1',
          userId: 'user-1',
        },
      },
    });
    expect(prisma.statementImportBatch.delete).toHaveBeenCalledWith({
      where: {
        id: 'batch-1',
      },
    });
  });

  it('does not remove a batch that has applied imported movements', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
    });
    prisma.importedMovement.count.mockResolvedValue(1);

    await expect(service.removeBatch('user-1', 'batch-1')).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.statementImportBatch.delete).not.toHaveBeenCalled();
  });

  it('does not update movements from another user', async () => {
    prisma.importedMovement.findFirst.mockResolvedValue(null);

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.IGNORED,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.importedMovement.update).not.toHaveBeenCalled();
  });

  it('does not revise movements that were already applied', async () => {
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.APPLIED,
    });

    await expect(
      service.updateMovementStatus(
        'user-1',
        'movement-1',
        ImportedMovementStatus.NEW,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.importedMovement.update).not.toHaveBeenCalled();
  });

  it('does not edit movements that were already applied', async () => {
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.APPLIED,
    });

    await expect(
      service.updateMovement('user-1', 'movement-1', {
        rawType: 'PIX',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.importedMovement.update).not.toHaveBeenCalled();
  });
});
