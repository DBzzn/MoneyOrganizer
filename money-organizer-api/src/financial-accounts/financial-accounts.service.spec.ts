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
      updateMany: jest.Mock;
    };
    transfer: {
      groupBy: jest.Mock;
      updateMany: jest.Mock;
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
        updateMany: jest.fn(),
      },
      transfer: {
        groupBy: jest.fn(),
        updateMany: jest.fn(),
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

  it('returns current balances calculated from initial balance, transactions and transfers', async () => {
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

    await expect(service.findAll('user-1')).resolves.toEqual([
      {
        ...accounts[0],
        currentBalance: '150.25',
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
