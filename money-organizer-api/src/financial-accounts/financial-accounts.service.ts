import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialAccountDto } from './dto/create-financial-account.dto';
import { UpdateFinancialAccountDto } from './dto/update-financial-account.dto';
import { QueryAccountLedgerDto } from './dto/query-account-ledger.dto';
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

const CATEGORY_SUMMARY_SELECT = {
  id: true,
  name: true,
  icon: true,
  isArchived: true,
};

type FinancialAccountSummary = Prisma.FinancialAccountGetPayload<{
  select: typeof FINANCIAL_ACCOUNT_SELECT;
}>;

type AccountLedgerItem = {
  id: string;
  sourceId: string;
  sourceType: 'TRANSACTION' | 'TRANSFER' | 'BALANCE_ADJUSTMENT';
  movementType:
    | 'TRANSACTION_INCOME'
    | 'TRANSACTION_EXPENSE'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'BALANCE_ADJUSTMENT';
  date: Date;
  createdAt: Date;
  title: string;
  description: string | null;
  amount: string;
  signedAmount: string;
  isPending: boolean;
  transactionType?: TransactionType;
  category?: {
    id: string;
    name: string;
    icon: string | null;
    isArchived: boolean;
  };
  relatedAccount?: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    isArchived: boolean;
  };
};

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

function toLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function endOfLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function toFixedAmount(value: Prisma.Decimal | number): string {
  return Number(value).toFixed(2);
}

function buildLedgerDateFilter(filters: QueryAccountLedgerDto) {
  const dateFilter: Prisma.DateTimeFilter = {};

  if (filters.startDate) {
    dateFilter.gte = toLocalDate(filters.startDate);
  }

  if (filters.endDate) {
    dateFilter.lte = endOfLocalDate(filters.endDate);
  }

  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
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

  async getLedger(
    userId: string,
    accountId: string,
    filters: QueryAccountLedgerDto,
  ) {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, userId },
      select: FINANCIAL_ACCOUNT_SELECT,
    });

    if (!account) {
      throw new NotFoundException('Conta financeira nÃ£o encontrada!');
    }

    await this.confirmOverduePendingMovements(userId);

    const dateFilter = buildLedgerDateFilter(filters);
    const dateWhere = dateFilter ? { date: dateFilter } : {};

    const [accountWithBalance, transactions, transfers, adjustments] =
      await Promise.all([
        this.withCurrentBalance(userId, account),
        this.prisma.transaction.findMany({
          where: {
            userId,
            financialAccountId: accountId,
            ...dateWhere,
          },
          select: {
            id: true,
            type: true,
            amount: true,
            date: true,
            isPending: true,
            description: true,
            createdAt: true,
            category: {
              select: CATEGORY_SUMMARY_SELECT,
            },
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.transfer.findMany({
          where: {
            userId,
            OR: [
              { fromAccountId: accountId },
              { toAccountId: accountId },
            ],
            ...dateWhere,
          },
          select: {
            id: true,
            amount: true,
            date: true,
            isPending: true,
            description: true,
            fromAccountId: true,
            toAccountId: true,
            createdAt: true,
            fromAccount: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
                isArchived: true,
              },
            },
            toAccount: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
                isArchived: true,
              },
            },
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.balanceAdjustment.findMany({
          where: {
            userId,
            financialAccountId: accountId,
            ...dateWhere,
          },
          select: {
            id: true,
            amount: true,
            date: true,
            reason: true,
            createdAt: true,
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);

    const transactionItems: AccountLedgerItem[] = transactions.map((transaction) => {
      const isIncome = transaction.type === TransactionType.INCOME;
      const amount = Number(transaction.amount);
      const title = transaction.description?.trim() || transaction.category.name;

      return {
        id: `transaction:${transaction.id}`,
        sourceId: transaction.id,
        sourceType: 'TRANSACTION',
        movementType: isIncome ? 'TRANSACTION_INCOME' : 'TRANSACTION_EXPENSE',
        date: transaction.date,
        createdAt: transaction.createdAt,
        title,
        description: transaction.category.name,
        amount: toFixedAmount(transaction.amount),
        signedAmount: toFixedAmount(isIncome ? amount : -amount),
        isPending: transaction.isPending,
        transactionType: transaction.type,
        category: transaction.category,
      };
    });

    const transferItems: AccountLedgerItem[] = transfers.map((transfer) => {
      const isIncoming = transfer.toAccountId === accountId;
      const relatedAccount = isIncoming ? transfer.fromAccount : transfer.toAccount;
      const amount = Number(transfer.amount);

      return {
        id: `transfer:${transfer.id}:${isIncoming ? 'in' : 'out'}`,
        sourceId: transfer.id,
        sourceType: 'TRANSFER',
        movementType: isIncoming ? 'TRANSFER_IN' : 'TRANSFER_OUT',
        date: transfer.date,
        createdAt: transfer.createdAt,
        title: isIncoming
          ? `Transferencia recebida de ${relatedAccount.name}`
          : `Transferencia enviada para ${relatedAccount.name}`,
        description: transfer.description ?? null,
        amount: toFixedAmount(transfer.amount),
        signedAmount: toFixedAmount(isIncoming ? amount : -amount),
        isPending: transfer.isPending,
        relatedAccount,
      };
    });

    const adjustmentItems: AccountLedgerItem[] = adjustments.map((adjustment) => ({
      id: `balance-adjustment:${adjustment.id}`,
      sourceId: adjustment.id,
      sourceType: 'BALANCE_ADJUSTMENT',
      movementType: 'BALANCE_ADJUSTMENT',
      date: adjustment.date,
      createdAt: adjustment.createdAt,
      title: adjustment.reason,
      description: null,
      amount: toFixedAmount(adjustment.amount),
      signedAmount: toFixedAmount(adjustment.amount),
      isPending: false,
    }));

    const items = [
      ...transactionItems,
      ...transferItems,
      ...adjustmentItems,
    ].sort((a, b) => {
      const dateDiff = b.date.getTime() - a.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const totals = items.reduce(
      (acc, item) => {
        const signedAmount = Number(item.signedAmount);
        acc.netChange += signedAmount;

        if (item.isPending) {
          acc.pendingCount += 1;
        }

        if (item.movementType === 'TRANSACTION_INCOME') {
          acc.income += signedAmount;
        } else if (item.movementType === 'TRANSACTION_EXPENSE') {
          acc.expenses += Math.abs(signedAmount);
        } else if (item.movementType === 'TRANSFER_IN') {
          acc.incomingTransfers += signedAmount;
        } else if (item.movementType === 'TRANSFER_OUT') {
          acc.outgoingTransfers += Math.abs(signedAmount);
        } else if (item.movementType === 'BALANCE_ADJUSTMENT') {
          acc.adjustments += signedAmount;
        }

        return acc;
      },
      {
        income: 0,
        expenses: 0,
        incomingTransfers: 0,
        outgoingTransfers: 0,
        adjustments: 0,
        netChange: 0,
        pendingCount: 0,
      },
    );

    return {
      account: accountWithBalance,
      filters: {
        startDate: filters.startDate ?? null,
        endDate: filters.endDate ?? null,
      },
      totals: {
        income: totals.income.toFixed(2),
        expenses: totals.expenses.toFixed(2),
        incomingTransfers: totals.incomingTransfers.toFixed(2),
        outgoingTransfers: totals.outgoingTransfers.toFixed(2),
        adjustments: totals.adjustments.toFixed(2),
        netChange: totals.netChange.toFixed(2),
        pendingCount: totals.pendingCount,
      },
      items,
    };
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
