import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialAccountDto } from './dto/create-financial-account.dto';
import { UpdateFinancialAccountDto } from './dto/update-financial-account.dto';
import { FinancialAccountType, Prisma, TransactionType } from '../../generated/prisma/client';

const FINANCIAL_ACCOUNT_SELECT = {
  id: true,
  name: true,
  type: true,
  institutionName: true,
  icon: true,
  color: true,
  initialBalance: true,
  includeInDashboard: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
};

type FinancialAccountSummary = Prisma.FinancialAccountGetPayload<{
  select: typeof FINANCIAL_ACCOUNT_SELECT;
}>;

function removeUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfTomorrow(): Date {
  const today = startOfToday();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
}

@Injectable()
export class FinancialAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private async confirmOverduePendingMovements(userId: string) {
    const overdueWhere = {
      userId,
      isPending: true,
      date: { lt: startOfToday() },
    };

    await Promise.all([
      this.prisma.transaction.updateMany({
        where: overdueWhere,
        data: { isPending: false },
      }),
      this.prisma.transfer.updateMany({
        where: overdueWhere,
        data: { isPending: false },
      }),
    ]);
  }

  private async withCurrentBalances<T extends FinancialAccountSummary>(
    userId: string,
    accounts: T[],
  ) {
    if (accounts.length === 0) {
      return [];
    }

    await this.confirmOverduePendingMovements(userId);

    const accountIds = accounts.map((account) => account.id);
    const today = startOfToday();
    const effectiveMovementWhere = {
      userId,
      date: { lt: startOfTomorrow() },
      OR: [
        { isPending: false },
        { date: { lt: today } },
      ],
    };

    const [
      transactionTotals,
      outgoingTransferTotals,
      incomingTransferTotals,
      adjustmentTotals,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['financialAccountId', 'type'],
        where: {
          ...effectiveMovementWhere,
          financialAccountId: { in: accountIds },
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: {
          ...effectiveMovementWhere,
          fromAccountId: { in: accountIds },
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: {
          ...effectiveMovementWhere,
          toAccountId: { in: accountIds },
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.balanceAdjustment.groupBy({
        by: ['financialAccountId'],
        where: {
          userId,
          financialAccountId: { in: accountIds },
          date: { lt: startOfTomorrow() },
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const totalsByAccount = transactionTotals.reduce((totals, item) => {
      const accountId = item.financialAccountId;
      const current = totals.get(accountId) ?? { income: 0, expenses: 0 };
      const amount = Number(item._sum.amount ?? 0);

      if (item.type === TransactionType.INCOME) {
        current.income += amount;
      } else {
        current.expenses += amount;
      }

      totals.set(accountId, current);
      return totals;
    }, new Map<string, { income: number; expenses: number }>());

    const outgoingTransfersByAccount = new Map(
      outgoingTransferTotals.map((item) => [
        item.fromAccountId,
        Number(item._sum.amount ?? 0),
      ]),
    );

    const incomingTransfersByAccount = new Map(
      incomingTransferTotals.map((item) => [
        item.toAccountId,
        Number(item._sum.amount ?? 0),
      ]),
    );

    const adjustmentsByAccount = new Map(
      adjustmentTotals.map((item) => [
        item.financialAccountId,
        Number(item._sum.amount ?? 0),
      ]),
    );

    return accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) ?? { income: 0, expenses: 0 };
      const incomingTransfers = incomingTransfersByAccount.get(account.id) ?? 0;
      const outgoingTransfers = outgoingTransfersByAccount.get(account.id) ?? 0;
      const adjustments = adjustmentsByAccount.get(account.id) ?? 0;
      const currentBalance =
        Number(account.initialBalance) +
        totals.income -
        totals.expenses +
        incomingTransfers -
        outgoingTransfers +
        adjustments;

      return {
        ...account,
        currentBalance: currentBalance.toFixed(2),
      };
    });
  }

  private async withCurrentBalance<T extends FinancialAccountSummary>(
    userId: string,
    account: T,
  ) {
    const [accountWithBalance] = await this.withCurrentBalances(userId, [account]);
    return accountWithBalance;
  }

  async create(userId: string, dto: CreateFinancialAccountDto) {
    const account = await this.prisma.financialAccount.create({
      data: {
        name: dto.name,
        type: dto.type ?? FinancialAccountType.BANK_ACCOUNT,
        institutionName: dto.institutionName,
        icon: dto.icon,
        color: dto.color,
        initialBalance:
          dto.initialBalance !== undefined
            ? new Prisma.Decimal(dto.initialBalance)
            : undefined,
        includeInDashboard: dto.includeInDashboard ?? true,
        userId,
      },
      select: FINANCIAL_ACCOUNT_SELECT,
    });

    return this.withCurrentBalance(userId, account);
  }

  async findAll(userId: string) {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { userId },
      select: FINANCIAL_ACCOUNT_SELECT,
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
    });

    return this.withCurrentBalances(userId, accounts);
  }

  async findOne(userId: string, accountId: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, userId },
      select: FINANCIAL_ACCOUNT_SELECT,
    });

    if (!account) {
      throw new NotFoundException('Conta financeira não encontrada!');
    }

    return this.withCurrentBalance(userId, account);
  }

  async update(
    userId: string,
    accountId: string,
    dto: UpdateFinancialAccountDto,
  ) {
    const data = removeUndefined({
      name: dto.name,
      type: dto.type,
      institutionName: dto.institutionName,
      icon: dto.icon,
      color: dto.color,
      initialBalance:
        dto.initialBalance !== undefined
          ? new Prisma.Decimal(dto.initialBalance)
          : undefined,
      includeInDashboard: dto.includeInDashboard,
      isArchived: dto.isArchived,
    });

    try {
      const account = await this.prisma.financialAccount.update({
        where: { id: accountId, userId },
        data,
        select: FINANCIAL_ACCOUNT_SELECT,
      });

      return this.withCurrentBalance(userId, account);
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Conta financeira não encontrada!');
      }
      throw error;
    }
  }

  async remove(userId: string, accountId: string) {
    try {
      await this.prisma.financialAccount.update({
        where: { id: accountId, userId },
        data: { isArchived: true },
      });

      return { message: 'Conta financeira arquivada com sucesso!' };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Conta financeira não encontrada!');
      }
      throw error;
    }
  }
}
