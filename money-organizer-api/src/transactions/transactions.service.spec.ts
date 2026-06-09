import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '../../generated/prisma/client';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
      groupBy: jest.Mock;
    };
    category: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    financialAccount: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        groupBy: jest.fn(),
      },
      category: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      financialAccount: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((input: unknown) => {
        if (Array.isArray(input)) {
          return Promise.all(input as Array<Promise<unknown>>);
        }

        if (typeof input === 'function') {
          const callback = input as (tx: typeof prisma) => unknown;
          return callback(prisma);
        }

        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('remove', () => {
    it('deletes only after validating ownership for every id', async () => {
      prisma.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]);
      prisma.transaction.deleteMany.mockResolvedValue({ count: 2 });

      await expect(service.remove('user-1', ['tx-1', 'tx-2'])).resolves.toEqual({
        message: '2 transação(ões) deletada(s) com sucesso.',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1', 'tx-2'] },
          userId: 'user-1',
        },
        select: { id: true },
      });
      expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1', 'tx-2'] },
          userId: 'user-1',
        },
      });
    });

    it('does not delete anything when any id is missing or belongs to another user', async () => {
      prisma.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }]);

      await expect(service.remove('user-1', ['tx-1', 'tx-2'])).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
    });

    it('accepts a single id', async () => {
      prisma.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }]);
      prisma.transaction.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove('user-1', 'tx-1')).resolves.toEqual({
        message: 'Transação deletada com sucesso!',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1'] },
          userId: 'user-1',
        },
        select: { id: true },
      });
      expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1'] },
          userId: 'user-1',
        },
      });
    });
  });

  describe('findAll', () => {
    it('filters by multiple financial accounts only after validating ownership', async () => {
      prisma.financialAccount.findMany.mockResolvedValue([
        { id: 'account-1' },
        { id: 'account-2' },
      ]);
      prisma.transaction.findMany.mockResolvedValue([]);

      await expect(
        service.findAll('user-1', {
          financialAccountIds: ['account-1', 'account-2'],
        }),
      ).resolves.toEqual([]);

      expect(prisma.financialAccount.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['account-1', 'account-2'] },
          userId: 'user-1',
        },
        select: { id: true },
      });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            financialAccountId: { in: ['account-1', 'account-2'] },
          },
        }),
      );
    });

    it('does not query transactions when any financial account is invalid', async () => {
      prisma.financialAccount.findMany.mockResolvedValue([{ id: 'account-1' }]);

      await expect(
        service.findAll('user-1', {
          financialAccountIds: ['account-1', 'account-2'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getTotalsByCategory', () => {
    it('loads category metadata in a single query for the authenticated user', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        {
          categoryId: 'category-1',
          _sum: { amount: { toString: () => '45.67' } },
          _count: { id: 1 },
        },
        {
          categoryId: 'category-2',
          _sum: { amount: { toString: () => '150.00' } },
          _count: { id: 2 },
        },
      ]);
      prisma.category.findMany.mockResolvedValue([
        { id: 'category-1', name: 'Alimentação', icon: '🍔' },
        { id: 'category-2', name: 'Saúde', icon: '💊' },
      ]);

      await expect(
        service.getTotalsByCategory('user-1', { type: TransactionType.INCOME }),
      ).resolves.toEqual([
        {
          categoryId: 'category-2',
          categoryName: 'Saúde',
          categoryIcon: '💊',
          totalAmount: '150.00',
          transactionCount: 2,
        },
        {
          categoryId: 'category-1',
          categoryName: 'Alimentação',
          categoryIcon: '🍔',
          totalAmount: '45.67',
          transactionCount: 1,
        },
      ]);

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['category-1', 'category-2'] },
          userId: 'user-1',
        },
        select: {
          id: true,
          name: true,
          icon: true,
        },
      });
    });
  });

  describe('createInstallment', () => {
    it('distributes cents without losing the total amount', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
      prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
      prisma.transaction.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: `tx-${data.currentInstallment}`,
          currentInstallment: data.currentInstallment,
          date: data.date,
          amount: data.amount,
        }),
      );

      await expect(
        service.createInstallment('user-1', {
          totalAmount: 100,
          totalInstallments: 3,
          firstInstallmentDate: '2026-06-08',
          categoryId: 'category-1',
          financialAccountId: 'account-1',
        }),
      ).resolves.toMatchObject({
        totalInstallments: 3,
        installmentValue: '33.33',
        installments: [
          { currentInstallment: 1, amount: '33.33' },
          { currentInstallment: 2, amount: '33.33' },
          { currentInstallment: 3, amount: '33.34' },
        ],
      });

      expect(prisma.transaction.create).toHaveBeenCalledTimes(3);
      const createdAmounts = prisma.transaction.create.mock.calls.map((call) => {
        const createArgs = call[0] as { data: { amount: number } };
        return createArgs.data.amount;
      });

      expect(createdAmounts).toEqual([33.33, 33.33, 33.34]);
    });
  });
});
