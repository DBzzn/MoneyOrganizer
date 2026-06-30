import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync, readdirSync } from 'fs';
import { extname, resolve } from 'path';
import {
  ImportedMovementStatus,
  ImportedMovementReconciliationStatus,
  ImportedMovementReviewTarget,
  CategoryKind,
  Prisma,
  TransactionType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { NubankPdfParser } from './parsers/nubank-pdf.parser';
import { OfxParser } from './parsers/ofx.parser';
import { inferAccountNumberFromFileName } from './parsers/parser-utils';
import { StatementImportsService } from './statement-imports.service';
import { UploadedStatementFile } from './types';

type ParserMock = {
  priority: number;
  label: string;
  canParse: jest.Mock;
  parse: jest.Mock;
};

type TransactionRunner = <T>(
  callback: (tx: PrismaMock) => T | Promise<T>,
) => T | Promise<T>;

type CreatedMovementRow = {
  status: string;
  fingerprint: string;
  reviewCategoryId?: string;
};

type CreatedStatementFileData = {
  provider: string;
  sourceType: string;
  status: string;
  duplicateOfFileId: string | null;
  accountNumber: string | null;
  batchId: string;
  financialAccountId: string | null;
  userId: string;
  periodStart: Date | undefined;
  periodEnd: Date | undefined;
  movements: {
    create: CreatedMovementRow[];
  };
};

type PrismaMock = {
  $transaction: jest.MockedFunction<TransactionRunner>;
  statementImportBatch: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  statementImportFile: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  transaction: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  transfer: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
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

function mockStatementParser(priority: number, label: string): ParserMock {
  return {
    priority,
    label,
    canParse: jest.fn(),
    parse: jest.fn(),
  };
}

const REAL_NU_FIXTURES_DIR = resolve(
  __dirname,
  '../../../docs/EXEMPLOS DE EXTRATOS/NU',
);
const MOCK_STATEMENT_ACCOUNT_NUMBER = '12345-6';
const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.csv': 'text/csv',
  '.ofx': 'application/x-ofx',
  '.pdf': 'application/pdf',
};

function realNuFixtureFilesByExtension(extension: '.csv' | '.ofx' | '.pdf') {
  return readdirSync(REAL_NU_FIXTURES_DIR)
    .filter((fileName) => extname(fileName).toLowerCase() === extension)
    .sort();
}

function realNuFixtureFiles(
  extension: '.csv' | '.ofx' | '.pdf',
  periodStart: string,
  periodEnd: string,
) {
  const periodToken = `_${periodStart}_${periodEnd}`;

  return realNuFixtureFilesByExtension(extension).filter((fileName) =>
    fileName.includes(periodToken),
  );
}

function realNuFixtureFile(
  extension: '.csv' | '.ofx' | '.pdf',
  periodStart: string,
  periodEnd: string,
) {
  const [fileName] = realNuFixtureFiles(extension, periodStart, periodEnd);

  if (!fileName) {
    throw new Error(
      `Missing real NU fixture for ${periodStart} to ${periodEnd}${extension}`,
    );
  }

  return fileName;
}

function fixtureAccountNumber(fileName: string) {
  const accountNumber = inferAccountNumberFromFileName(fileName);

  if (!accountNumber) {
    throw new Error(`Invalid fixture account token: ${fileName}`);
  }

  return accountNumber;
}

function realNuUpload(fileName: string): UploadedStatementFile {
  const buffer = readFileSync(resolve(REAL_NU_FIXTURES_DIR, fileName));

  return {
    originalname: fileName,
    mimetype: MIME_TYPE_BY_EXTENSION[extname(fileName).toLowerCase()],
    size: buffer.length,
    buffer,
  };
}

describe('StatementImportsService', () => {
  let service: StatementImportsService;
  let ofxParser: ParserMock;
  let csvStatementParser: ParserMock;
  let nubankPdfParser: ParserMock;
  let prisma: PrismaMock;

  beforeEach(async () => {
    ofxParser = mockStatementParser(10, 'OFX');
    csvStatementParser = mockStatementParser(20, 'CSV/TSV');
    nubankPdfParser = mockStatementParser(30, 'Nubank PDF');

    const runTransaction: TransactionRunner = (callback) => callback(prisma);

    prisma = {
      $transaction: jest.fn<TransactionRunner>(runTransaction),
      statementImportBatch: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      statementImportFile: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      transfer: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
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
    prisma.statementImportFile.findMany.mockResolvedValue([]);
    prisma.importedMovement.findMany.mockResolvedValue([]);
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

  function useRealStatementParsers() {
    const realOfxParser = new OfxParser();
    const realCsvParser = new CsvStatementParser();
    const realPdfParser = new NubankPdfParser();

    ofxParser.canParse.mockImplementation((fileName, mimeType, buffer) =>
      realOfxParser.canParse(fileName, mimeType, buffer),
    );
    csvStatementParser.canParse.mockImplementation(
      (fileName, mimeType, buffer) =>
        realCsvParser.canParse(fileName, mimeType, buffer),
    );
    nubankPdfParser.canParse.mockImplementation((fileName, mimeType, buffer) =>
      realPdfParser.canParse(fileName, mimeType, buffer),
    );
    ofxParser.parse.mockImplementation((buffer, fileName) =>
      realOfxParser.parse(buffer, fileName),
    );
    csvStatementParser.parse.mockImplementation((buffer, fileName) =>
      realCsvParser.parse(buffer, fileName),
    );
    nubankPdfParser.parse.mockImplementation((buffer, fileName) =>
      realPdfParser.parse(buffer, fileName),
    );
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updates a batch name scoped to the user', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({ id: 'batch-1' });
    prisma.statementImportBatch.update.mockResolvedValue({ id: 'batch-1' });
    const renamedBatch = {
      id: 'batch-1',
      name: 'Nubank maio',
      files: [],
    };
    jest.spyOn(service, 'findBatch').mockResolvedValue(renamedBatch as never);

    await expect(
      service.updateBatch('user-1', 'batch-1', { name: ' Nubank maio ' }),
    ).resolves.toBe(renamedBatch);

    expect(prisma.statementImportBatch.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'batch-1',
        userId: 'user-1',
      },
      select: {
        id: true,
      },
    });
    expect(prisma.statementImportBatch.update).toHaveBeenCalledWith({
      where: {
        id: 'batch-1',
      },
      data: {
        name: 'Nubank maio',
      },
      select: {
        id: true,
      },
    });
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

  it('previews a real NU CSV fixture with account, period, totals and file hash', async () => {
    useRealStatementParsers();
    const fileName = realNuFixtureFile('.csv', '01JUN2026', '10JUN2026');

    const preview = await service.preview('user-1', realNuUpload(fileName));

    expect(preview).toMatchObject({
      provider: 'NUBANK',
      sourceType: 'CSV',
      accountNumber: fixtureAccountNumber(fileName),
      periodStart: '2026-06-01',
      periodEnd: '2026-06-10',
      warnings: [],
    });
    expect(preview.file.sha256).toHaveLength(64);
    expect(preview.movements).toHaveLength(4);
    expect(preview.summary).toEqual({
      totalInCents: 276532,
      totalOutCents: 27240,
    });
  });

  it('previews an inferred account from previous imports with the same statement account', async () => {
    const buffer = Buffer.from('date,amount,id\n01/06/2026,-39.90,mov-1');
    ofxParser.canParse.mockReturnValue(false);
    csvStatementParser.canParse.mockReturnValue(true);
    csvStatementParser.parse.mockReturnValue({
      provider: 'NUBANK',
      sourceType: 'CSV',
      accountNumber: MOCK_STATEMENT_ACCOUNT_NUMBER,
      movements: [],
      warnings: [],
    });
    prisma.statementImportFile.findMany.mockResolvedValueOnce([
      {
        provider: 'NUBANK',
        accountNumber: MOCK_STATEMENT_ACCOUNT_NUMBER,
        financialAccount: {
          id: 'account-nubank',
          name: 'Conta Nubank',
          type: 'BANK_ACCOUNT',
          institutionName: 'Nubank',
          icon: 'Landmark',
          color: '#820ad1',
          isArchived: false,
        },
      },
    ]);

    await expect(
      service.preview('user-1', {
        originalname: 'nubank.csv',
        mimetype: 'text/csv',
        size: buffer.length,
        buffer,
      }),
    ).resolves.toMatchObject({
      targetAccount: {
        id: 'account-nubank',
        name: 'Conta Nubank',
      },
    });
    expect(prisma.statementImportFile.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        financialAccountId: { not: null },
        OR: [
          {
            provider: 'NUBANK',
            accountNumber: MOCK_STATEMENT_ACCOUNT_NUMBER,
          },
        ],
      },
      select: {
        provider: true,
        accountNumber: true,
        financialAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            institutionName: true,
            icon: true,
            color: true,
            isArchived: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  });

  it('persists duplicated real NU CSV fixtures as duplicate file and movements', async () => {
    useRealStatementParsers();
    const octoberCsvFiles = realNuFixtureFiles(
      '.csv',
      '01OUT2025',
      '31OUT2025',
    );
    expect(octoberCsvFiles).toHaveLength(2);
    const persistedBatch = {
      id: 'batch-1',
      files: [],
    };
    jest.spyOn(service, 'findBatch').mockResolvedValue(persistedBatch as never);
    prisma.statementImportBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.statementImportFile.create
      .mockResolvedValueOnce({ id: 'file-1' })
      .mockResolvedValueOnce({ id: 'file-2' });

    await expect(
      service.createBatch('user-1', [
        realNuUpload(octoberCsvFiles[0]),
        realNuUpload(octoberCsvFiles[1]),
      ]),
    ).resolves.toBe(persistedBatch);

    expect(prisma.statementImportFile.create).toHaveBeenCalledTimes(2);

    const firstFileData = prisma.statementImportFile.create.mock.calls[0][0]
      .data as CreatedStatementFileData;
    const secondFileData = prisma.statementImportFile.create.mock.calls[1][0]
      .data as CreatedStatementFileData;
    const firstMovements = firstFileData.movements.create;
    const secondMovements = secondFileData.movements.create;

    expect(firstFileData).toMatchObject({
      provider: 'NUBANK',
      sourceType: 'CSV',
      status: 'PARSED',
      duplicateOfFileId: null,
      accountNumber: fixtureAccountNumber(octoberCsvFiles[0]),
      batchId: 'batch-1',
      financialAccountId: null,
      userId: 'user-1',
    });
    expect(secondFileData).toMatchObject({
      provider: 'NUBANK',
      sourceType: 'CSV',
      status: 'DUPLICATE',
      duplicateOfFileId: 'file-1',
      accountNumber: fixtureAccountNumber(octoberCsvFiles[1]),
      batchId: 'batch-1',
      financialAccountId: null,
      userId: 'user-1',
    });
    expect(firstFileData.periodStart).toEqual(new Date(2025, 9, 1, 12));
    expect(firstFileData.periodEnd).toEqual(new Date(2025, 9, 31, 12));
    expect(firstMovements.length).toBeGreaterThan(0);
    expect(secondMovements).toHaveLength(firstMovements.length);
    expect(firstMovements.every((movement) => movement.status === 'NEW')).toBe(
      true,
    );
    expect(
      secondMovements.every((movement) => movement.status === 'DUPLICATE'),
    ).toBe(true);
    expect(firstMovements.map((movement) => movement.fingerprint)).toEqual(
      secondMovements.map((movement) => movement.fingerprint),
    );
    expect(
      new Set(firstMovements.map((movement) => movement.fingerprint)).size,
    ).toBe(firstMovements.length);
  });

  it('deduplicates a real NU monthly trio across CSV, OFX and PDF while inferring the account', async () => {
    useRealStatementParsers();
    const periodStart = '01JUN2026';
    const periodEnd = '10JUN2026';
    const csvFileName = realNuFixtureFile('.csv', periodStart, periodEnd);
    const ofxFileName = realNuFixtureFile('.ofx', periodStart, periodEnd);
    const pdfFileName = realNuFixtureFile('.pdf', periodStart, periodEnd);
    const statementAccountNumber = fixtureAccountNumber(csvFileName);
    const persistedBatch = {
      id: 'batch-1',
      files: [],
    };

    jest.spyOn(service, 'findBatch').mockResolvedValue(persistedBatch as never);
    prisma.statementImportBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.statementImportFile.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          provider: 'NUBANK',
          accountNumber: statementAccountNumber,
          financialAccount: {
            id: 'account-nubank',
            name: 'Conta Nubank',
            type: 'BANK_ACCOUNT',
            institutionName: 'Nubank',
            icon: 'Landmark',
            color: '#820ad1',
            isArchived: false,
          },
        },
      ]);
    prisma.statementImportFile.create
      .mockResolvedValueOnce({ id: 'file-csv' })
      .mockResolvedValueOnce({ id: 'file-ofx' })
      .mockResolvedValueOnce({ id: 'file-pdf' });

    await expect(
      service.createBatch('user-1', [
        realNuUpload(csvFileName),
        realNuUpload(ofxFileName),
        realNuUpload(pdfFileName),
      ]),
    ).resolves.toBe(persistedBatch);

    expect(prisma.statementImportFile.create).toHaveBeenCalledTimes(3);

    const [csvFileData, ofxFileData, pdfFileData] =
      prisma.statementImportFile.create.mock.calls.map(
        ([call]) => call.data as CreatedStatementFileData,
      );
    const csvMovements = csvFileData.movements.create;
    const ofxMovements = ofxFileData.movements.create;
    const pdfMovements = pdfFileData.movements.create;

    expect([csvFileData, ofxFileData, pdfFileData]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'CSV',
          status: 'PARSED',
          duplicateOfFileId: null,
          accountNumber: statementAccountNumber,
          financialAccountId: 'account-nubank',
        }),
        expect.objectContaining({
          sourceType: 'OFX',
          status: 'PARSED',
          duplicateOfFileId: null,
          accountNumber: statementAccountNumber,
          financialAccountId: 'account-nubank',
        }),
        expect.objectContaining({
          sourceType: 'PDF',
          status: 'PARSED',
          duplicateOfFileId: null,
          accountNumber: statementAccountNumber,
          financialAccountId: 'account-nubank',
        }),
      ]),
    );
    expect(csvMovements).toHaveLength(4);
    expect(ofxMovements).toHaveLength(csvMovements.length);
    expect(pdfMovements).toHaveLength(csvMovements.length);
    expect(csvMovements.every((movement) => movement.status === 'NEW')).toBe(
      true,
    );
    expect(
      ofxMovements.every(
        (movement) => movement.status === ImportedMovementStatus.DUPLICATE,
      ),
    ).toBe(true);
    expect(
      pdfMovements.every(
        (movement) => movement.status === ImportedMovementStatus.DUPLICATE,
      ),
    ).toBe(true);
  });

  it('deduplicates every real NU PDF movement against its matching CSV batch', async () => {
    useRealStatementParsers();
    const csvFileNames = realNuFixtureFilesByExtension('.csv');
    const persistedBatch = {
      id: 'batch-1',
      files: [],
    };
    let nextFileId = 0;

    expect(csvFileNames).toHaveLength(19);
    jest.spyOn(service, 'findBatch').mockResolvedValue(persistedBatch as never);
    prisma.statementImportBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.statementImportFile.create.mockImplementation(async () => ({
      id: `file-${++nextFileId}`,
    }));

    for (const csvFileName of csvFileNames) {
      const pdfFileName = csvFileName.replace(/\.csv$/i, '.pdf');
      const previousCreateCallCount =
        prisma.statementImportFile.create.mock.calls.length;

      await expect(
        service.createBatch('user-1', [
          realNuUpload(csvFileName),
          realNuUpload(pdfFileName),
        ]),
      ).resolves.toBe(persistedBatch);

      const [csvCreateCall, pdfCreateCall] =
        prisma.statementImportFile.create.mock.calls.slice(
          previousCreateCallCount,
          previousCreateCallCount + 2,
        );
      const csvFileData = csvCreateCall[0].data as CreatedStatementFileData;
      const pdfFileData = pdfCreateCall[0].data as CreatedStatementFileData;
      const csvMovements = csvFileData.movements.create;
      const pdfMovements = pdfFileData.movements.create;

      expect(csvFileData.sourceType).toBe('CSV');
      expect(pdfFileData.sourceType).toBe('PDF');
      expect(pdfFileData.accountNumber).toBe(csvFileData.accountNumber);
      expect(pdfMovements).toHaveLength(csvMovements.length);
      expect(
        pdfMovements.every(
          (movement) => movement.status === ImportedMovementStatus.DUPLICATE,
        ),
      ).toBe(true);
    }
  });

  it('prefills category from reviewed import history when creating a batch', async () => {
    const buffer = Buffer.from('date,amount,id\n01/06/2026,-39.90,mov-1');
    const persistedBatch = {
      id: 'batch-1',
      files: [],
    };
    ofxParser.canParse.mockReturnValue(false);
    csvStatementParser.canParse.mockReturnValue(true);
    csvStatementParser.parse.mockReturnValue({
      provider: 'NUBANK',
      sourceType: 'CSV',
      accountNumber: MOCK_STATEMENT_ACCOUNT_NUMBER,
      movements: [
        {
          date: '2026-06-01',
          amountCents: 3990,
          direction: 'OUT',
          rawType: 'DEBITO',
          rawDescription: 'Netflix.com',
          normalizedDescription: 'NETFLIX COM',
          sourceLine: 2,
          externalId: 'mov-1',
          fingerprint: 'fingerprint-1',
        },
      ],
      warnings: [],
    });
    jest.spyOn(service, 'findBatch').mockResolvedValue(persistedBatch as never);
    prisma.statementImportBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.statementImportFile.create.mockResolvedValue({ id: 'file-1' });
    prisma.importedMovement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          direction: 'OUT',
          rawDescription: 'Netflix.com',
          normalizedDescription: 'NETFLIX COM',
          reviewCategory: {
            id: 'category-streaming',
            name: 'Streaming',
            icon: 'Tv',
            kind: CategoryKind.EXPENSE,
            isArchived: false,
          },
        },
      ]);

    await expect(
      service.createBatch('user-1', [
        {
          originalname: 'nubank.csv',
          mimetype: 'text/csv',
          size: buffer.length,
          buffer,
        },
      ]),
    ).resolves.toBe(persistedBatch);

    const fileData = prisma.statementImportFile.create.mock.calls[0][0]
      .data as CreatedStatementFileData;
    expect(fileData.movements.create[0]).toMatchObject({
      status: ImportedMovementStatus.NEEDS_REVIEW,
      reviewCategoryId: 'category-streaming',
    });
  });

  it('infers file financial account from previous imports with the same statement account', async () => {
    const buffer = Buffer.from('date,amount,id\n01/06/2026,-39.90,mov-1');
    const persistedBatch = {
      id: 'batch-1',
      files: [],
    };
    ofxParser.canParse.mockReturnValue(false);
    csvStatementParser.canParse.mockReturnValue(true);
    csvStatementParser.parse.mockReturnValue({
      provider: 'NUBANK',
      sourceType: 'CSV',
      accountNumber: MOCK_STATEMENT_ACCOUNT_NUMBER,
      movements: [
        {
          date: '2026-06-01',
          amountCents: 3990,
          direction: 'OUT',
          rawType: 'DEBITO',
          rawDescription: 'Netflix.com',
          normalizedDescription: 'NETFLIX COM',
          sourceLine: 2,
          externalId: 'mov-1',
          fingerprint: 'fingerprint-1',
        },
      ],
      warnings: [],
    });
    jest.spyOn(service, 'findBatch').mockResolvedValue(persistedBatch as never);
    prisma.statementImportBatch.create.mockResolvedValue({ id: 'batch-1' });
    prisma.statementImportFile.create.mockResolvedValue({ id: 'file-1' });
    prisma.statementImportFile.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          provider: 'NUBANK',
          accountNumber: MOCK_STATEMENT_ACCOUNT_NUMBER,
          financialAccount: {
            id: 'account-nubank',
            name: 'Conta Nubank',
            type: 'BANK_ACCOUNT',
            institutionName: 'Nubank',
            icon: 'Landmark',
            color: '#820ad1',
            isArchived: false,
          },
        },
      ]);

    await expect(
      service.createBatch('user-1', [
        {
          originalname: 'nubank.csv',
          mimetype: 'text/csv',
          size: buffer.length,
          buffer,
        },
      ]),
    ).resolves.toBe(persistedBatch);

    const fileData = prisma.statementImportFile.create.mock.calls[0][0]
      .data as CreatedStatementFileData;
    expect(fileData.financialAccountId).toBe('account-nubank');
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
        kind: { in: [CategoryKind.EXPENSE, CategoryKind.BOTH] },
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

  it('applies a reviewed category to selected movements in one batch operation', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
    });
    prisma.importedMovement.findMany
      .mockResolvedValueOnce([
        {
          id: 'movement-1',
          direction: 'OUT',
          status: ImportedMovementStatus.NEW,
          reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
        },
        {
          id: 'movement-2',
          direction: 'OUT',
          status: ImportedMovementStatus.READY,
          reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
        },
      ])
      .mockResolvedValueOnce([
        { status: ImportedMovementStatus.NEEDS_REVIEW },
        { status: ImportedMovementStatus.NEEDS_REVIEW },
      ]);
    prisma.category.findFirst.mockResolvedValue({
      id: 'category-1',
    });
    prisma.importedMovement.updateMany.mockResolvedValue({
      count: 2,
    });
    prisma.statementImportBatch.update.mockResolvedValue({
      id: 'batch-1',
    });

    await expect(
      service.bulkReviewCategory('user-1', 'batch-1', {
        movementIds: ['movement-1', 'movement-2'],
        reviewCategoryId: 'category-1',
      }),
    ).resolves.toEqual({
      updatedCount: 2,
      batchStatus: 'REVIEWING',
    });

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        userId: 'user-1',
        isArchived: false,
        kind: { in: [CategoryKind.EXPENSE, CategoryKind.BOTH] },
      },
      select: {
        id: true,
      },
    });
    expect(prisma.importedMovement.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['movement-1', 'movement-2'] },
        userId: 'user-1',
        file: {
          batchId: 'batch-1',
          userId: 'user-1',
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
        reviewCategoryId: 'category-1',
        reviewTransferAccountId: null,
        reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
        status: ImportedMovementStatus.NEEDS_REVIEW,
        reconciliationStatus: ImportedMovementReconciliationStatus.PENDING,
        reconciliationNote: null,
        reconciliationReviewedAt: null,
      },
    });
  });

  it('rejects bulk category review when selected movements are not editable transactions', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
    });
    prisma.importedMovement.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        direction: 'OUT',
        status: ImportedMovementStatus.APPLIED,
        reviewTarget: ImportedMovementReviewTarget.TRANSACTION,
      },
    ]);

    await expect(
      service.bulkReviewCategory('user-1', 'batch-1', {
        movementIds: ['movement-1'],
        reviewCategoryId: 'category-1',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.importedMovement.updateMany).not.toHaveBeenCalled();
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
        kind: { in: [CategoryKind.EXPENSE, CategoryKind.BOTH] },
      },
      select: {
        id: true,
      },
    });
  });

  it('marks imported CSV transaction as ready when review type is inferred from description', async () => {
    const updatedMovement = {
      id: 'movement-1',
      status: ImportedMovementStatus.READY,
    };
    prisma.importedMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      status: ImportedMovementStatus.NEEDS_REVIEW,
      date: new Date(2026, 5, 15, 12),
      direction: 'OUT',
      amountCents: 4990,
      rawType: 'CSV',
      rawDescription: 'Compra no debito - Padaria Central',
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
        kind: { in: [CategoryKind.EXPENSE, CategoryKind.BOTH] },
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
              rawType: 'CSV',
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

  it('undoes applied movements and restores them to ready', async () => {
    jest.spyOn(service, 'findBatch').mockResolvedValue({
      id: 'batch-1',
    } as any);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      files: [
        {
          id: 'file-1',
          movements: [
            {
              id: 'movement-1',
              status: ImportedMovementStatus.APPLIED,
              appliedTransactionId: 'transaction-1',
              appliedTransferId: null,
            },
            {
              id: 'movement-2',
              status: ImportedMovementStatus.APPLIED,
              appliedTransactionId: null,
              appliedTransferId: 'transfer-1',
            },
          ],
        },
      ],
    });
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 });
    prisma.transfer.deleteMany.mockResolvedValue({ count: 1 });
    prisma.importedMovement.updateMany.mockResolvedValue({ count: 2 });
    prisma.importedMovement.findMany.mockResolvedValue([
      { status: ImportedMovementStatus.READY },
      { status: ImportedMovementStatus.READY },
    ]);
    prisma.statementImportBatch.update.mockResolvedValue({ id: 'batch-1' });

    await expect(
      service.undoAppliedMovements('user-1', 'batch-1'),
    ).resolves.toMatchObject({
      undoneCount: 2,
      transactionCount: 1,
      transferCount: 1,
      batchStatus: 'REVIEWING',
    });

    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['transaction-1'] },
        userId: 'user-1',
      },
    });
    expect(prisma.transfer.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['transfer-1'] },
        userId: 'user-1',
      },
    });
    expect(prisma.importedMovement.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['movement-1', 'movement-2'] },
        userId: 'user-1',
        status: ImportedMovementStatus.APPLIED,
      },
      data: {
        status: ImportedMovementStatus.READY,
        appliedTransactionId: null,
        appliedTransferId: null,
        appliedAt: null,
      },
    });
  });

  it('undoes only selected applied movements from a batch', async () => {
    jest.spyOn(service, 'findBatch').mockResolvedValue({
      id: 'batch-1',
    } as any);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      files: [
        {
          id: 'file-1',
          movements: [
            {
              id: 'movement-1',
              status: ImportedMovementStatus.APPLIED,
              appliedTransactionId: 'transaction-1',
              appliedTransferId: null,
            },
            {
              id: 'movement-2',
              status: ImportedMovementStatus.APPLIED,
              appliedTransactionId: 'transaction-2',
              appliedTransferId: null,
            },
          ],
        },
      ],
    });
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 });
    prisma.importedMovement.updateMany.mockResolvedValue({ count: 1 });
    prisma.importedMovement.findMany.mockResolvedValue([
      { status: ImportedMovementStatus.READY },
      { status: ImportedMovementStatus.APPLIED },
    ]);
    prisma.statementImportBatch.update.mockResolvedValue({ id: 'batch-1' });

    await expect(
      service.undoAppliedMovements('user-1', 'batch-1', ['movement-1']),
    ).resolves.toMatchObject({
      undoneCount: 1,
      transactionCount: 1,
      transferCount: 0,
      batchStatus: 'PARTIALLY_APPLIED',
    });

    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['transaction-1'] },
        userId: 'user-1',
      },
    });
    expect(prisma.importedMovement.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['movement-1'] },
        userId: 'user-1',
        status: ImportedMovementStatus.APPLIED,
      },
      data: {
        status: ImportedMovementStatus.READY,
        appliedTransactionId: null,
        appliedTransferId: null,
        appliedAt: null,
      },
    });
  });

  it('does not undo a batch without applied movements', async () => {
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      files: [
        {
          id: 'file-1',
          movements: [
            {
              id: 'movement-1',
              status: ImportedMovementStatus.READY,
            },
          ],
        },
      ],
    });

    await expect(
      service.undoAppliedMovements('user-1', 'batch-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.transfer.deleteMany).not.toHaveBeenCalled();
    expect(prisma.importedMovement.updateMany).not.toHaveBeenCalled();
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
            kind: CategoryKind.EXPENSE,
            isArchived: false,
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
            kind: CategoryKind.EXPENSE,
            isArchived: false,
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

  it('suggests categories from already reviewed imported movements', async () => {
    const movementDate = new Date(2026, 1, 22, 12);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'REVIEWING',
      createdAt: new Date(2026, 1, 22, 13),
      updatedAt: new Date(2026, 1, 22, 13),
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              date: movementDate,
              direction: 'OUT',
              amountCents: 3990,
              rawDescription: 'Netflix.com',
              normalizedDescription: 'NETFLIX COM',
              reconciliationStatus:
                ImportedMovementReconciliationStatus.PENDING,
            },
          ],
        },
      ],
    });
    prisma.importedMovement.findMany.mockResolvedValue([
      {
        direction: 'OUT',
        rawDescription: 'Netflix.com',
        normalizedDescription: 'NETFLIX COM',
        reviewCategory: {
          id: 'category-streaming',
          name: 'Streaming',
          icon: 'Tv',
          kind: CategoryKind.EXPENSE,
          isArchived: false,
        },
      },
    ]);

    const batch = await service.findBatch('user-1', 'batch-1');
    const hints = (batch.files[0].movements[0] as any).reviewHints;

    expect(hints.categorySuggestion).toMatchObject({
      categoryId: 'category-streaming',
      categoryName: 'Streaming',
      categoryIcon: 'Tv',
      basedOnCount: 1,
    });
    expect(prisma.importedMovement.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
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
    });
  });

  it('does not suggest archived categories from transaction history', async () => {
    const movementDate = new Date(2026, 1, 22, 12);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'REVIEWING',
      createdAt: new Date(2026, 1, 22, 13),
      updatedAt: new Date(2026, 1, 22, 13),
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              date: movementDate,
              direction: 'OUT',
              amountCents: 1290,
              rawDescription: 'Cafe Central',
              normalizedDescription: 'CAFE CENTRAL',
              reconciliationStatus:
                ImportedMovementReconciliationStatus.PENDING,
            },
          ],
        },
      ],
    });
    prisma.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          description: 'Cafe Central',
          type: TransactionType.DEBIT,
          category: {
            id: 'category-archived',
            name: 'Arquivada',
            icon: null,
            kind: CategoryKind.EXPENSE,
            isArchived: true,
          },
        },
      ]);

    const batch = await service.findBatch('user-1', 'batch-1');
    const hints = (batch.files[0].movements[0] as any).reviewHints;

    expect(hints.categorySuggestion).toBeUndefined();
  });

  it('does not suggest imported review categories with incompatible kind', async () => {
    const movementDate = new Date(2026, 1, 23, 12);
    prisma.statementImportBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'REVIEWING',
      createdAt: new Date(2026, 1, 23, 13),
      updatedAt: new Date(2026, 1, 23, 13),
      files: [
        {
          id: 'file-1',
          financialAccountId: 'account-1',
          movements: [
            {
              id: 'movement-1',
              date: movementDate,
              direction: 'OUT',
              amountCents: 120000,
              rawDescription: 'Salario mensal',
              normalizedDescription: 'SALARIO MENSAL',
              reconciliationStatus:
                ImportedMovementReconciliationStatus.PENDING,
            },
          ],
        },
      ],
    });
    prisma.importedMovement.findMany.mockResolvedValue([
      {
        direction: 'OUT',
        rawDescription: 'Salario mensal',
        normalizedDescription: 'SALARIO MENSAL',
        reviewCategory: {
          id: 'category-income',
          name: 'Salario',
          icon: 'Briefcase',
          kind: CategoryKind.INCOME,
          isArchived: false,
        },
      },
    ]);

    const batch = await service.findBatch('user-1', 'batch-1');
    const hints = (batch.files[0].movements[0] as any).reviewHints;

    expect(hints.categorySuggestion).toBeUndefined();
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
      message: 'Lote de importação excluído com sucesso.',
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
