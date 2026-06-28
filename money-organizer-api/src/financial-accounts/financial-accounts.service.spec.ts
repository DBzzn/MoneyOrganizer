import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FinancialAccountsService } from './financial-accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAccountType, Prisma, TransactionType } from '../../generated/prisma/client';

describe('FinancialAccountsService', () => {
  let service: FinancialAccountsService;
  let prisma: {
    financialAccount: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    transaction: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    transfer: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    balanceAdjustment: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      financialAccount: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      transfer: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      balanceAdjustment: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialAccountsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<FinancialAccountsService>(FinancialAccountsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an account scoped to the authenticated user', async () => {
    const createdAccount = {
      id: 'account-1',
      name: 'Nubank',
      type: FinancialAccountType.BANK_ACCOUNT,
      institutionName: null,
      icon: null,
      color: null,
      initialBalance: new Prisma.Decimal(25.5),
      includeInDashboard: true,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.financialAccount.create.mockResolvedValue(createdAccount);
    prisma.transaction.groupBy.mockResolvedValue([]);
    prisma.transfer.groupBy.mockResolvedValue([]);
    prisma.balanceAdjustment.groupBy.mockResolvedValue([]);

    await expect(
      service.create('user-1', {
        name: 'Nubank',
        type: FinancialAccountType.BANK_ACCOUNT,
        initialBalance: 25.5,
      }),
    ).resolves.toEqual({
      ...createdAccount,
      currentBalance: '25.50',
    });

    expect(prisma.financialAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Nubank',
          type: FinancialAccountType.BANK_ACCOUNT,
          initialBalance: expect.any(Prisma.Decimal),
          includeInDashboard: true,
          userId: 'user-1',
        }),
      }),
    );
  });

  it('returns current balances calculated from initial balance, transactions, transfers and adjustments', async () => {
    const accounts = [
      {
        id: 'account-1',
        name: 'Nubank',
        type: FinancialAccountType.BANK_ACCOUNT,
        institutionName: null,
        icon: null,
        color: null,
        initialBalance: new Prisma.Decimal(100),
        includeInDashboard: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    prisma.financialAccount.findMany.mockResolvedValue(accounts);
    prisma.transaction.groupBy.mockResolvedValue([
      {
        financialAccountId: 'account-1',
        type: TransactionType.INCOME,
        _sum: { amount: new Prisma.Decimal(75.5) },
      },
      {
        financialAccountId: 'account-1',
        type: TransactionType.DEBIT,
        _sum: { amount: new Prisma.Decimal(20.25) },
      },
    ]);
    prisma.transfer.groupBy
      .mockResolvedValueOnce([
        {
          fromAccountId: 'account-1',
          _sum: { amount: new Prisma.Decimal(10) },
        },
      ])
      .mockResolvedValueOnce([
        {
          toAccountId: 'account-1',
          _sum: { amount: new Prisma.Decimal(5) },
        },
      ]);
    prisma.balanceAdjustment.groupBy.mockResolvedValue([
      {
        financialAccountId: 'account-1',
        _sum: { amount: new Prisma.Decimal(12.75) },
      },
    ]);

    await expect(service.findAll('user-1')).resolves.toEqual([
      {
        ...accounts[0],
        currentBalance: '163.00',
      },
    ]);

    expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
      by: ['financialAccountId', 'type'],
      where: expect.objectContaining({
        userId: 'user-1',
        financialAccountId: { in: ['account-1'] },
        date: { lt: expect.any(Date) },
        OR: [
          { isPending: false },
          { date: { lt: expect.any(Date) } },
        ],
      }),
      _sum: {
        amount: true,
      },
    });
    expect(prisma.transfer.groupBy).toHaveBeenCalledWith({
      by: ['fromAccountId'],
      where: expect.objectContaining({
        userId: 'user-1',
        fromAccountId: { in: ['account-1'] },
        date: { lt: expect.any(Date) },
        OR: [
          { isPending: false },
          { date: { lt: expect.any(Date) } },
        ],
      }),
      _sum: {
        amount: true,
      },
    });
    expect(prisma.transfer.groupBy).toHaveBeenCalledWith({
      by: ['toAccountId'],
      where: expect.objectContaining({
        userId: 'user-1',
        toAccountId: { in: ['account-1'] },
        date: { lt: expect.any(Date) },
        OR: [
          { isPending: false },
          { date: { lt: expect.any(Date) } },
        ],
      }),
      _sum: {
        amount: true,
      },
    });
    expect(prisma.balanceAdjustment.groupBy).toHaveBeenCalledWith({
      by: ['financialAccountId'],
      where: expect.objectContaining({
        userId: 'user-1',
        financialAccountId: { in: ['account-1'] },
        date: { lt: expect.any(Date) },
      }),
      _sum: {
        amount: true,
      },
    });
  });

  it('returns a unified account ledger with signed movements', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-10T12:00:00.000Z'));

    const account = {
      id: 'account-1',
      name: 'Nubank',
      type: FinancialAccountType.BANK_ACCOUNT,
      institutionName: null,
      icon: null,
      color: null,
      initialBalance: new Prisma.Decimal(0),
      includeInDashboard: true,
      isArchived: false,
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    };

    prisma.financialAccount.findFirst.mockResolvedValue(account);
    const ledgerStart = new Date(2026, 5, 1, 12).getTime();
    prisma.transaction.groupBy.mockImplementation((args) => {
      if (args.where.date.lt.getTime() === ledgerStart) {
        return Promise.resolve([]);
      }

      return Promise.resolve([
        {
          financialAccountId: 'account-1',
          type: TransactionType.INCOME,
          _sum: { amount: new Prisma.Decimal(100) },
        },
        {
          financialAccountId: 'account-1',
          type: TransactionType.DEBIT,
          _sum: { amount: new Prisma.Decimal(25) },
        },
      ]);
    });
    prisma.transfer.groupBy.mockImplementation((args) => {
      if (args.where.date.lt.getTime() === ledgerStart) {
        return Promise.resolve([]);
      }

      if (args.by.includes('fromAccountId')) {
        return Promise.resolve([
          {
            fromAccountId: 'account-1',
            _sum: { amount: new Prisma.Decimal(10) },
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.balanceAdjustment.groupBy.mockImplementation((args) => {
      if (args.where.date.lt.getTime() === ledgerStart) {
        return Promise.resolve([]);
      }

      return Promise.resolve([
        {
          financialAccountId: 'account-1',
          _sum: { amount: new Prisma.Decimal(5) },
        },
      ]);
    });
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'transaction-income',
        type: TransactionType.INCOME,
        amount: new Prisma.Decimal(100),
        date: new Date('2026-06-01T12:00:00.000Z'),
        isPending: false,
        description: 'Salario',
        createdAt: new Date('2026-06-01T13:00:00.000Z'),
        category: {
          id: 'category-income',
          name: 'Receitas',
          icon: null,
          isArchived: false,
        },
      },
      {
        id: 'transaction-expense',
        type: TransactionType.DEBIT,
        amount: new Prisma.Decimal(25),
        date: new Date('2026-06-02T12:00:00.000Z'),
        isPending: true,
        description: null,
        createdAt: new Date('2026-06-02T13:00:00.000Z'),
        category: {
          id: 'category-food',
          name: 'Mercado',
          icon: null,
          isArchived: false,
        },
      },
    ]);
    prisma.transfer.findMany.mockResolvedValue([
      {
        id: 'transfer-future',
        amount: new Prisma.Decimal(40),
        date: new Date('2026-06-20T12:00:00.000Z'),
        isPending: true,
        description: 'Agendada',
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        createdAt: new Date('2026-06-20T13:00:00.000Z'),
        fromAccount: {
          id: 'account-1',
          name: 'Nubank',
          icon: null,
          color: null,
          isArchived: false,
        },
        toAccount: {
          id: 'account-2',
          name: 'Poupanca',
          icon: null,
          color: null,
          isArchived: false,
        },
      },
      {
        id: 'transfer-1',
        amount: new Prisma.Decimal(10),
        date: new Date('2026-06-03T12:00:00.000Z'),
        isPending: false,
        description: 'Reserva',
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        createdAt: new Date('2026-06-03T13:00:00.000Z'),
        fromAccount: {
          id: 'account-1',
          name: 'Nubank',
          icon: null,
          color: null,
          isArchived: false,
        },
        toAccount: {
          id: 'account-2',
          name: 'Poupanca',
          icon: null,
          color: null,
          isArchived: false,
        },
      },
    ]);
    prisma.balanceAdjustment.findMany.mockResolvedValue([
      {
        id: 'adjustment-1',
        amount: new Prisma.Decimal(5),
        date: new Date('2026-06-04T12:00:00.000Z'),
        reason: 'Conferencia',
        createdAt: new Date('2026-06-04T13:00:00.000Z'),
      },
    ]);

    await expect(
      service.getLedger('user-1', 'account-1', {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      }),
    ).resolves.toMatchObject({
      account: {
        id: 'account-1',
        currentBalance: '70.00',
      },
      filters: {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      },
      totals: {
        income: '100.00',
        expenses: '25.00',
        incomingTransfers: '0.00',
        outgoingTransfers: '50.00',
        adjustments: '5.00',
        netChange: '30.00',
        effectiveNetChange: '70.00',
        pendingCount: 2,
      },
      openingBalance: '0.00',
      closingBalance: '70.00',
      items: [
        expect.objectContaining({
          sourceType: 'TRANSFER',
          movementType: 'TRANSFER_OUT',
          signedAmount: '-40.00',
          balanceAfter: '70.00',
          affectsCurrentBalance: false,
          isPending: true,
        }),
        expect.objectContaining({
          sourceType: 'BALANCE_ADJUSTMENT',
          movementType: 'BALANCE_ADJUSTMENT',
          signedAmount: '5.00',
          balanceAfter: '70.00',
          affectsCurrentBalance: true,
        }),
        expect.objectContaining({
          sourceType: 'TRANSFER',
          movementType: 'TRANSFER_OUT',
          signedAmount: '-10.00',
          balanceAfter: '65.00',
          affectsCurrentBalance: true,
          relatedAccount: expect.objectContaining({ id: 'account-2' }),
        }),
        expect.objectContaining({
          sourceType: 'TRANSACTION',
          movementType: 'TRANSACTION_EXPENSE',
          title: 'Mercado',
          signedAmount: '-25.00',
          balanceAfter: '75.00',
          affectsCurrentBalance: true,
        }),
        expect.objectContaining({
          sourceType: 'TRANSACTION',
          movementType: 'TRANSACTION_INCOME',
          title: 'Salario',
          signedAmount: '100.00',
          balanceAfter: '100.00',
          affectsCurrentBalance: true,
        }),
      ],
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          financialAccountId: 'account-1',
          date: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
    expect(prisma.transfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          OR: [
            { fromAccountId: 'account-1' },
            { toAccountId: 'account-1' },
          ],
        }),
      }),
    );
    expect(prisma.balanceAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          financialAccountId: 'account-1',
        }),
      }),
    );
  });

  it('uses prior effective movements as the opening balance for filtered ledgers', async () => {
    const account = {
      id: 'account-1',
      name: 'Nubank',
      type: FinancialAccountType.BANK_ACCOUNT,
      institutionName: null,
      icon: null,
      color: null,
      initialBalance: new Prisma.Decimal(50),
      includeInDashboard: true,
      isArchived: false,
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    };
    const ledgerStart = new Date(2026, 5, 3, 12).getTime();

    prisma.financialAccount.findFirst.mockResolvedValue(account);
    prisma.transaction.groupBy.mockResolvedValue([
      {
        financialAccountId: 'account-1',
        type: TransactionType.INCOME,
        _sum: { amount: new Prisma.Decimal(100) },
      },
      {
        financialAccountId: 'account-1',
        type: TransactionType.DEBIT,
        _sum: { amount: new Prisma.Decimal(20) },
      },
    ]);
    prisma.transfer.groupBy.mockImplementation((args) => {
      if (args.where.date.lt.getTime() === ledgerStart) {
        return Promise.resolve([]);
      }

      if (args.by.includes('toAccountId')) {
        return Promise.resolve([
          {
            toAccountId: 'account-1',
            _sum: { amount: new Prisma.Decimal(10) },
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.balanceAdjustment.groupBy.mockImplementation((args) => {
      if (args.where.date.lt.getTime() === ledgerStart) {
        return Promise.resolve([]);
      }

      return Promise.resolve([
        {
          financialAccountId: 'account-1',
          _sum: { amount: new Prisma.Decimal(5) },
        },
      ]);
    });
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transfer.findMany.mockResolvedValue([
      {
        id: 'transfer-1',
        amount: new Prisma.Decimal(10),
        date: new Date('2026-06-03T12:00:00.000Z'),
        isPending: false,
        description: null,
        fromAccountId: 'account-2',
        toAccountId: 'account-1',
        createdAt: new Date('2026-06-03T13:00:00.000Z'),
        fromAccount: {
          id: 'account-2',
          name: 'Poupanca',
          icon: null,
          color: null,
          isArchived: false,
        },
        toAccount: {
          id: 'account-1',
          name: 'Nubank',
          icon: null,
          color: null,
          isArchived: false,
        },
      },
    ]);
    prisma.balanceAdjustment.findMany.mockResolvedValue([
      {
        id: 'adjustment-1',
        amount: new Prisma.Decimal(5),
        date: new Date('2026-06-04T12:00:00.000Z'),
        reason: 'Conferencia',
        createdAt: new Date('2026-06-04T13:00:00.000Z'),
      },
    ]);

    await expect(
      service.getLedger('user-1', 'account-1', {
        startDate: '2026-06-03',
        endDate: '2026-06-30',
      }),
    ).resolves.toMatchObject({
      account: {
        currentBalance: '145.00',
      },
      openingBalance: '130.00',
      closingBalance: '145.00',
      totals: {
        incomingTransfers: '10.00',
        adjustments: '5.00',
        netChange: '15.00',
        effectiveNetChange: '15.00',
      },
      items: [
        expect.objectContaining({
          sourceType: 'BALANCE_ADJUSTMENT',
          signedAmount: '5.00',
          balanceAfter: '145.00',
        }),
        expect.objectContaining({
          sourceType: 'TRANSFER',
          movementType: 'TRANSFER_IN',
          signedAmount: '10.00',
          balanceAfter: '140.00',
        }),
      ],
    });
  });

  it('does not return a ledger for an account from another user', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.getLedger('user-1', 'account-2', {}),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.transfer.findMany).not.toHaveBeenCalled();
    expect(prisma.balanceAdjustment.findMany).not.toHaveBeenCalled();
  });

  it('does not return an account from another user', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue(null);

    await expect(service.findOne('user-1', 'account-2')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-2', userId: 'user-1' },
      }),
    );
  });

  it('archives accounts instead of deleting financial history', async () => {
    prisma.financialAccount.update.mockResolvedValue({ id: 'account-1' });

    await expect(service.remove('user-1', 'account-1')).resolves.toEqual({
      message: 'Conta financeira arquivada com sucesso!',
    });

    expect(prisma.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'account-1', userId: 'user-1' },
      data: { isArchived: true },
    });
  });
});
