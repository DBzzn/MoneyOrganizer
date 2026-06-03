import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
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
});
