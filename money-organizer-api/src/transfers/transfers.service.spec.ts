import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransfersService } from './transfers.service';
import { Prisma } from '../../generated/prisma/client';

describe('TransfersService', () => {
  let service: TransfersService;
  let prisma: {
    financialAccount: {
      findFirst: jest.Mock;
    };
    transfer: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      financialAccount: {
        findFirst: jest.fn(),
      },
      transfer: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a transfer scoped to active accounts from the same user', async () => {
    prisma.financialAccount.findFirst
      .mockResolvedValueOnce({ id: 'account-from' })
      .mockResolvedValueOnce({ id: 'account-to' });
    prisma.transfer.create.mockResolvedValue({
      id: 'transfer-1',
      amount: new Prisma.Decimal(50),
      date: new Date(2026, 5, 9, 12),
      isPending: false,
      description: 'Reserva',
      fromAccountId: 'account-from',
      toAccountId: 'account-to',
    });

    await service.create('user-1', {
      amount: 50,
      date: '2026-06-09',
      fromAccountId: 'account-from',
      toAccountId: 'account-to',
    });

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-from',
        userId: 'user-1',
        isArchived: false,
      },
      select: { id: true },
    });
    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-to',
        userId: 'user-1',
        isArchived: false,
      },
      select: { id: true },
    });
    expect(prisma.transfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: expect.any(Prisma.Decimal),
          fromAccountId: 'account-from',
          toAccountId: 'account-to',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('rejects transfers between the same account', async () => {
    await expect(
      service.create('user-1', {
        amount: 50,
        date: '2026-06-09',
        fromAccountId: 'account-1',
        toAccountId: 'account-1',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });

  it('filters transfers by any involved account after validating ownership', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.transfer.findMany.mockResolvedValue([]);

    await service.findAll('user-1', { financialAccountId: 'account-1' });

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.transfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          OR: [
            { fromAccountId: 'account-1' },
            { toAccountId: 'account-1' },
          ],
        },
      }),
    );
  });

  it('confirms overdue pending transfers before listing', async () => {
    prisma.transfer.updateMany.mockResolvedValue({ count: 1 });
    prisma.transfer.findMany.mockResolvedValue([]);

    await expect(service.findAll('user-1', {})).resolves.toEqual([]);

    expect(prisma.transfer.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isPending: true,
        date: { lt: expect.any(Date) },
      },
      data: { isPending: false },
    });
  });

  it('does not update a transfer from another user', async () => {
    prisma.transfer.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user-1', 'transfer-1', { amount: 25 }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.transfer.update).not.toHaveBeenCalled();
  });
});
