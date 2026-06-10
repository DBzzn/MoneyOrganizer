import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceAdjustmentsService } from './balance-adjustments.service';
import { Prisma } from '../../generated/prisma/client';

describe('BalanceAdjustmentsService', () => {
  let service: BalanceAdjustmentsService;
  let prisma: {
    financialAccount: {
      findFirst: jest.Mock;
    };
    balanceAdjustment: {
      create: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      financialAccount: {
        findFirst: jest.fn(),
      },
      balanceAdjustment: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceAdjustmentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<BalanceAdjustmentsService>(BalanceAdjustmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a signed adjustment scoped to an active account from the user', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.balanceAdjustment.create.mockResolvedValue({
      id: 'adjustment-1',
      amount: new Prisma.Decimal(-42.35),
      date: new Date(2026, 5, 10, 12),
      reason: 'Conciliacao',
      financialAccountId: 'account-1',
    });

    await service.create('user-1', {
      amount: -42.35,
      date: '2026-06-10',
      reason: '  Conciliacao  ',
      financialAccountId: 'account-1',
    });

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        userId: 'user-1',
        isArchived: false,
      },
      select: { id: true },
    });
    expect(prisma.balanceAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: expect.any(Prisma.Decimal),
          reason: 'Conciliacao',
          financialAccountId: 'account-1',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('rejects zero amount adjustments', async () => {
    await expect(
      service.create('user-1', {
        amount: 0,
        date: '2026-06-10',
        reason: 'Sem diferenca',
        financialAccountId: 'account-1',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.balanceAdjustment.create).not.toHaveBeenCalled();
  });

  it('rejects archived or missing accounts when creating', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        amount: 25,
        date: '2026-06-10',
        reason: 'Conferencia',
        financialAccountId: 'account-1',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.balanceAdjustment.create).not.toHaveBeenCalled();
  });

  it('validates ownership before filtering by account', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.balanceAdjustment.findMany.mockResolvedValue([]);

    await service.findAll('user-1', { financialAccountId: 'account-1' });

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.balanceAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          financialAccountId: 'account-1',
        },
      }),
    );
  });

  it('does not delete an adjustment from another user', async () => {
    prisma.balanceAdjustment.delete.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.remove('user-1', 'adjustment-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
