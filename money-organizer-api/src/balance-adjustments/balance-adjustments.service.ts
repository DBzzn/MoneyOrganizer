import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBalanceAdjustmentDto } from './dto/create-balance-adjustment.dto';
import { QueryBalanceAdjustmentsDto } from './dto/query-balance-adjustments.dto';
import { UpdateBalanceAdjustmentDto } from './dto/update-balance-adjustment.dto';
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

const BALANCE_ADJUSTMENT_SELECT = {
  id: true,
  amount: true,
  date: true,
  reason: true,
  financialAccountId: true,
  createdAt: true,
  updatedAt: true,
  financialAccount: {
    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
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

@Injectable()
export class BalanceAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureNonZeroAmount(amount: number) {
    if (amount === 0) {
      throw new BadRequestException('O ajuste de saldo não pode ser zero.');
    }
  }

  private sanitizeReason(reason: string) {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      throw new BadRequestException('Informe o motivo do ajuste de saldo.');
    }

    return trimmedReason;
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
      throw new BadRequestException('Conta financeira não encontrada ou arquivada.');
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
      throw new BadRequestException('Conta financeira não encontrada.');
    }
  }

  async create(userId: string, dto: CreateBalanceAdjustmentDto) {
    this.ensureNonZeroAmount(dto.amount);
    const reason = this.sanitizeReason(dto.reason);
    await this.ensureActiveAccount(userId, dto.financialAccountId);

    return this.prisma.balanceAdjustment.create({
      data: {
        amount: new Prisma.Decimal(dto.amount),
        date: toLocalDate(dto.date),
        reason,
        financialAccountId: dto.financialAccountId,
        userId,
      },
      select: BALANCE_ADJUSTMENT_SELECT,
    });
  }

  async findAll(userId: string, filters: QueryBalanceAdjustmentsDto) {
    const where: Prisma.BalanceAdjustmentWhereInput = { userId };

    if (filters.financialAccountId) {
      await this.ensureAccountBelongsToUser(userId, filters.financialAccountId);
      where.financialAccountId = filters.financialAccountId;
    }

    if (filters.startDate || filters.endDate) {
      where.date = {};

      if (filters.startDate) {
        where.date.gte = toLocalDate(filters.startDate);
      }

      if (filters.endDate) {
        where.date.lte = endOfLocalDate(filters.endDate);
      }
    }

    return this.prisma.balanceAdjustment.findMany({
      where,
      select: BALANCE_ADJUSTMENT_SELECT,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async update(
    userId: string,
    adjustmentId: string,
    dto: UpdateBalanceAdjustmentDto,
  ) {
    if (dto.amount !== undefined) {
      this.ensureNonZeroAmount(dto.amount);
    }

    const data = removeUndefined({
      amount:
        dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
      date: dto.date !== undefined ? toLocalDate(dto.date) : undefined,
      reason:
        dto.reason !== undefined ? this.sanitizeReason(dto.reason) : undefined,
    });

    try {
      return await this.prisma.balanceAdjustment.update({
        where: {
          id: adjustmentId,
          userId,
        },
        data,
        select: BALANCE_ADJUSTMENT_SELECT,
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Ajuste de saldo não encontrado.');
      }
      throw error;
    }
  }

  async remove(userId: string, adjustmentId: string) {
    try {
      await this.prisma.balanceAdjustment.delete({
        where: {
          id: adjustmentId,
          userId,
        },
      });

      return { message: 'Ajuste de saldo removido com sucesso!' };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Ajuste de saldo não encontrado.');
      }
      throw error;
    }
  }
}
