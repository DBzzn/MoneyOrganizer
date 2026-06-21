import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';
import { QueryTransfersDto } from './dto/query-transfers.dto';
import { ImportedMovementStatus, Prisma } from '../../generated/prisma/client';

const FINANCIAL_ACCOUNT_SUMMARY_SELECT = {
  id: true,
  name: true,
  type: true,
  institutionName: true,
  icon: true,
  color: true,
  isArchived: true,
};

const IMPORT_SOURCE_SELECT = {
  id: true,
  appliedAt: true,
  file: {
    select: {
      id: true,
      originalName: true,
      provider: true,
      sourceType: true,
      batchId: true,
    },
  },
};

const TRANSFER_SELECT = {
  id: true,
  amount: true,
  date: true,
  isPending: true,
  description: true,
  fromAccountId: true,
  toAccountId: true,
  createdAt: true,
  updatedAt: true,
  fromAccount: {
    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
  },
  toAccount: {
    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
  },
  importedMovements: {
    select: IMPORT_SOURCE_SELECT,
  },
};

function removeUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function toLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function endOfLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function withCurrentPendingStatus<T extends { date: Date; isPending: boolean }>(
  transfer: T,
): T {
  if (!transfer.isPending || transfer.date >= startOfToday()) {
    return transfer;
  }

  return {
    ...transfer,
    isPending: false,
  };
}

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private async confirmOverduePendingTransfers(userId: string) {
    await this.prisma.transfer.updateMany({
      where: {
        userId,
        isPending: true,
        date: { lt: startOfToday() },
      },
      data: { isPending: false },
    });
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

  private ensureDifferentAccounts(fromAccountId: string, toAccountId: string) {
    if (fromAccountId === toAccountId) {
      throw new BadRequestException('A conta de origem deve ser diferente da conta de destino.');
    }
  }

  async create(userId: string, dto: CreateTransferDto) {
    this.ensureDifferentAccounts(dto.fromAccountId, dto.toAccountId);

    await Promise.all([
      this.ensureActiveAccount(userId, dto.fromAccountId),
      this.ensureActiveAccount(userId, dto.toAccountId),
    ]);

    const transfer = await this.prisma.transfer.create({
      data: {
        amount: new Prisma.Decimal(dto.amount),
        date: toLocalDate(dto.date),
        isPending: dto.isPending ?? false,
        description: dto.description,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        userId,
      },
      select: TRANSFER_SELECT,
    });

    return transfer;
  }

  async findAll(userId: string, filters: QueryTransfersDto) {
    await this.confirmOverduePendingTransfers(userId);

    const where: Prisma.TransferWhereInput = { userId };
    const dateFilter: Prisma.DateTimeFilter = {};

    if (filters.startDate) {
      dateFilter.gte = toLocalDate(filters.startDate);
    }

    if (filters.endDate) {
      dateFilter.lte = endOfLocalDate(filters.endDate);
    }

    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter;
    }

    if (filters.financialAccountId) {
      await this.ensureAccountBelongsToUser(userId, filters.financialAccountId);
      where.OR = [
        { fromAccountId: filters.financialAccountId },
        { toAccountId: filters.financialAccountId },
      ];
    }

    if (filters.isPending !== undefined) {
      where.isPending = filters.isPending;
    }

    const transfers = await this.prisma.transfer.findMany({
      where,
      select: TRANSFER_SELECT,
      orderBy: { date: 'desc' },
    });

    return transfers.map(withCurrentPendingStatus);
  }

  async findOne(userId: string, transferId: string) {
    await this.confirmOverduePendingTransfers(userId);

    const transfer = await this.prisma.transfer.findFirst({
      where: {
        id: transferId,
        userId,
      },
      select: TRANSFER_SELECT,
    });

    if (!transfer) {
      throw new NotFoundException('Transferência não encontrada.');
    }

    return withCurrentPendingStatus(transfer);
  }

  async update(userId: string, transferId: string, dto: UpdateTransferDto) {
    const existingTransfer = await this.prisma.transfer.findFirst({
      where: {
        id: transferId,
        userId,
      },
      select: {
        id: true,
        fromAccountId: true,
        toAccountId: true,
      },
    });

    if (!existingTransfer) {
      throw new NotFoundException('Transferência não encontrada.');
    }

    const nextFromAccountId = dto.fromAccountId ?? existingTransfer.fromAccountId;
    const nextToAccountId = dto.toAccountId ?? existingTransfer.toAccountId;

    this.ensureDifferentAccounts(nextFromAccountId, nextToAccountId);

    await Promise.all([
      dto.fromAccountId
        ? this.ensureActiveAccount(userId, dto.fromAccountId)
        : Promise.resolve(),
      dto.toAccountId
        ? this.ensureActiveAccount(userId, dto.toAccountId)
        : Promise.resolve(),
    ]);

    const data = removeUndefined({
      amount:
        dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
      date: dto.date !== undefined ? toLocalDate(dto.date) : undefined,
      isPending: dto.isPending,
      description: dto.description,
      fromAccount:
        dto.fromAccountId !== undefined
          ? { connect: { id: dto.fromAccountId } }
          : undefined,
      toAccount:
        dto.toAccountId !== undefined
          ? { connect: { id: dto.toAccountId } }
          : undefined,
    });

    try {
      const transfer = await this.prisma.transfer.update({
        where: {
          id: transferId,
          userId,
        },
        data,
        select: TRANSFER_SELECT,
      });

      return withCurrentPendingStatus(transfer);
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Transferência não encontrada.');
      }
      throw error;
    }
  }

  async remove(userId: string, transferId: string) {
    const transfer = await this.prisma.transfer.findFirst({
      where: {
        id: transferId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException('TransferÃªncia nÃ£o encontrada.');
    }

    const importedMovementCount = await this.prisma.importedMovement.count({
      where: {
        userId,
        status: ImportedMovementStatus.APPLIED,
        appliedTransferId: transfer.id,
      },
    });

    if (importedMovementCount > 0) {
      throw new BadRequestException(
        'Transferencia criada por importacao nao pode ser excluida diretamente. Mantenha a rastreabilidade ate existir um fluxo de desfazer para importacoes.',
      );
    }

    try {
      await this.prisma.transfer.delete({
        where: {
          id: transferId,
          userId,
        },
      });

      return { message: 'Transferência removida com sucesso!' };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Transferência não encontrada.');
      }
      throw error;
    }
  }
}
