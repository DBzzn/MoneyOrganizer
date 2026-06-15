import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { QueryRemindersDto } from './dto/query-reminders.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { Prisma } from '../../generated/prisma/client';

const FINANCIAL_ACCOUNT_SUMMARY_SELECT = {
  id: true,
  name: true,
  type: true,
  institutionName: true,
  icon: true,
  color: true,
  isArchived: true,
};

const CATEGORY_SUMMARY_SELECT = {
  id: true,
  name: true,
  icon: true,
  isArchived: true,
};

const REMINDER_SELECT = {
  id: true,
  title: true,
  dueDate: true,
  amount: true,
  status: true,
  note: true,
  financialAccountId: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  financialAccount: {
    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
  },
  category: {
    select: CATEGORY_SUMMARY_SELECT,
  },
};

function toLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function endOfLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function removeUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function sanitizeOptionalText(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizeTitle(title: string) {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      throw new BadRequestException('Informe o titulo do lembrete.');
    }

    return trimmedTitle;
  }

  private ensurePositiveAmount(amount?: number | null) {
    if (amount !== undefined && amount !== null && amount <= 0) {
      throw new BadRequestException('O valor do lembrete deve ser maior que zero.');
    }
  }

  private async ensureActiveAccount(userId: string, accountId: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: {
        id: accountId,
        userId,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!account) {
      throw new BadRequestException('Conta financeira nao encontrada ou arquivada.');
    }
  }

  private async ensureAccountBelongsToUser(userId: string, accountId: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
      select: { id: true },
    });

    if (!account) {
      throw new BadRequestException('Conta financeira nao encontrada.');
    }
  }

  private async ensureActiveCategory(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Categoria nao encontrada ou arquivada.');
    }
  }

  private async ensureCategoryBelongsToUser(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
      },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Categoria nao encontrada.');
    }
  }

  async create(userId: string, dto: CreateReminderDto) {
    this.ensurePositiveAmount(dto.amount);
    const title = this.sanitizeTitle(dto.title);

    if (dto.financialAccountId) {
      await this.ensureActiveAccount(userId, dto.financialAccountId);
    }

    if (dto.categoryId) {
      await this.ensureActiveCategory(userId, dto.categoryId);
    }

    return this.prisma.reminder.create({
      data: {
        title,
        dueDate: toLocalDate(dto.dueDate),
        amount:
          dto.amount !== undefined && dto.amount !== null
            ? new Prisma.Decimal(dto.amount)
            : null,
        status: dto.status,
        note: sanitizeOptionalText(dto.note),
        financialAccountId: dto.financialAccountId || null,
        categoryId: dto.categoryId || null,
        userId,
      },
      select: REMINDER_SELECT,
    });
  }

  async findAll(userId: string, filters: QueryRemindersDto) {
    const where: Prisma.ReminderWhereInput = { userId };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.financialAccountId) {
      await this.ensureAccountBelongsToUser(userId, filters.financialAccountId);
      where.financialAccountId = filters.financialAccountId;
    }

    if (filters.categoryId) {
      await this.ensureCategoryBelongsToUser(userId, filters.categoryId);
      where.categoryId = filters.categoryId;
    }

    if (filters.startDate || filters.endDate) {
      where.dueDate = {};

      if (filters.startDate) {
        where.dueDate.gte = toLocalDate(filters.startDate);
      }

      if (filters.endDate) {
        where.dueDate.lte = endOfLocalDate(filters.endDate);
      }
    }

    return this.prisma.reminder.findMany({
      where,
      select: REMINDER_SELECT,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: {
        id: reminderId,
        userId,
      },
      select: REMINDER_SELECT,
    });

    if (!reminder) {
      throw new NotFoundException('Lembrete nao encontrado.');
    }

    return reminder;
  }

  async update(userId: string, reminderId: string, dto: UpdateReminderDto) {
    if (dto.title !== undefined) {
      dto.title = this.sanitizeTitle(dto.title);
    }

    this.ensurePositiveAmount(dto.amount);

    if (dto.financialAccountId) {
      await this.ensureActiveAccount(userId, dto.financialAccountId);
    }

    if (dto.categoryId) {
      await this.ensureActiveCategory(userId, dto.categoryId);
    }

    const data = removeUndefined({
      title: dto.title,
      dueDate: dto.dueDate !== undefined ? toLocalDate(dto.dueDate) : undefined,
      amount:
        dto.amount !== undefined
          ? dto.amount === null
            ? null
            : new Prisma.Decimal(dto.amount)
          : undefined,
      status: dto.status,
      note: sanitizeOptionalText(dto.note),
      financialAccountId:
        dto.financialAccountId !== undefined ? dto.financialAccountId || null : undefined,
      categoryId: dto.categoryId !== undefined ? dto.categoryId || null : undefined,
    });

    try {
      return await this.prisma.reminder.update({
        where: {
          id: reminderId,
          userId,
        },
        data,
        select: REMINDER_SELECT,
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Lembrete nao encontrado.');
      }
      throw error;
    }
  }

  async remove(userId: string, reminderId: string) {
    try {
      await this.prisma.reminder.delete({
        where: {
          id: reminderId,
          userId,
        },
      });

      return { message: 'Lembrete removido com sucesso!' };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Lembrete nao encontrado.');
      }
      throw error;
    }
  }
}
