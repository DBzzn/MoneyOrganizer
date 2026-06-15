import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from './reminders.service';
import { Prisma, ReminderStatus } from '../../generated/prisma/client';

describe('RemindersService', () => {
  let service: RemindersService;
  let prisma: {
    financialAccount: {
      findFirst: jest.Mock;
    };
    category: {
      findFirst: jest.Mock;
    };
    reminder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      financialAccount: {
        findFirst: jest.fn(),
      },
      category: {
        findFirst: jest.fn(),
      },
      reminder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a reminder scoped to active optional account and category', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.reminder.create.mockResolvedValue({
      id: 'reminder-1',
      title: 'Pagar fatura',
      dueDate: new Date(2026, 5, 20, 12),
      amount: new Prisma.Decimal(120.5),
      status: ReminderStatus.PENDING,
      financialAccountId: 'account-1',
      categoryId: 'category-1',
    });

    await service.create('user-1', {
      title: '  Pagar fatura  ',
      dueDate: '2026-06-20',
      amount: 120.5,
      financialAccountId: 'account-1',
      categoryId: 'category-1',
      note: '  Conferir antes  ',
    });

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        userId: 'user-1',
        isArchived: false,
      },
      select: { id: true },
    });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        userId: 'user-1',
        isArchived: false,
      },
      select: { id: true },
    });
    expect(prisma.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Pagar fatura',
          dueDate: new Date(2026, 5, 20, 12),
          amount: expect.any(Prisma.Decimal),
          financialAccountId: 'account-1',
          categoryId: 'category-1',
          note: 'Conferir antes',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('rejects blank titles and non-positive amounts', async () => {
    await expect(
      service.create('user-1', {
        title: '   ',
        dueDate: '2026-06-20',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create('user-1', {
        title: 'Conta',
        dueDate: '2026-06-20',
        amount: 0,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('validates ownership before filtering by optional account and category', async () => {
    prisma.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.reminder.findMany.mockResolvedValue([]);

    await service.findAll('user-1', {
      financialAccountId: 'account-1',
      categoryId: 'category-1',
      status: ReminderStatus.PENDING,
    });

    expect(prisma.financialAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: ReminderStatus.PENDING,
          financialAccountId: 'account-1',
          categoryId: 'category-1',
        },
      }),
    );
  });

  it('updates status and can clear optional links', async () => {
    prisma.reminder.update.mockResolvedValue({
      id: 'reminder-1',
      status: ReminderStatus.DONE,
      financialAccountId: null,
      categoryId: null,
    });

    await service.update('user-1', 'reminder-1', {
      status: ReminderStatus.DONE,
      financialAccountId: null,
      categoryId: null,
      note: '   ',
    });

    expect(prisma.reminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'reminder-1',
          userId: 'user-1',
        },
        data: expect.objectContaining({
          status: ReminderStatus.DONE,
          financialAccountId: null,
          categoryId: null,
          note: null,
        }),
      }),
    );
  });

  it('does not update or remove reminders from another user', async () => {
    prisma.reminder.update.mockRejectedValue({ code: 'P2025' });
    prisma.reminder.delete.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.update('user-1', 'reminder-1', { status: ReminderStatus.DONE }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.remove('user-1', 'reminder-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
