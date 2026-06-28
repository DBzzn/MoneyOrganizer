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
  kind: true,
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
  balanceAfter: string;
  affectsCurrentBalance: boolean;
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

type AccountLedgerItemInternal = Omit<AccountLedgerItem, 'balanceAfter'> & {
  signedAmountCents: number;
  balanceAfter?: string;
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

function toCents(value: Prisma.Decimal | number | string): number {
  return new Prisma.Decimal(value).mul(100).toDecimalPlaces(0).toNumber();
}

function centsToFixed(cents: number): string {
  return new Prisma.Decimal(cents).div(100).toFixed(2);
}

function toFixedAmount(value: Prisma.Decimal | number | string): string {
  return centsToFixed(toCents(value));
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() < right.getTime() ? left : right;
}

function getEffectiveDateLimit(beforeDate?: Date): Date {
  return beforeDate ? minDate(beforeDate, startOfTomorrow()) : startOfTomorrow();
}

function buildEffectivePendingMovementWhere(userId: string, beforeDate?: Date) {
  const today = startOfToday();

  return {
    userId,
    date: { lt: getEffectiveDateLimit(beforeDate) },
    OR: [
      { isPending: false },
      { date: { lt: today } },
    ],
  };
}

function affectsCurrentPendingBalance(date: Date, isPending: boolean): boolean {
  const today = startOfToday();

  return (
    date.getTime() < startOfTomorrow().getTime() &&
    (!isPending || date.getTime() < today.getTime())
  );
}

function affectsCurrentAdjustmentBalance(date: Date): boolean {
  return date.getTime() < startOfTomorrow().getTime();
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
    const effectiveMovementWhere = buildEffectivePendingMovementWhere(userId);

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
      const amountCents = toCents(item._sum.amount ?? 0);

      if (item.type === TransactionType.INCOME) {
        current.income += amountCents;
      } else {
        current.expenses += amountCents;
      }

      totals.set(accountId, current);
      return totals;
    }, new Map<string, { income: number; expenses: number }>());

    const outgoingTransfersByAccount = new Map(
      outgoingTransferTotals.map((item) => [
        item.fromAccountId,
        toCents(item._sum.amount ?? 0),
      ]),
    );

    const incomingTransfersByAccount = new Map(
      incomingTransferTotals.map((item) => [
        item.toAccountId,
        toCents(item._sum.amount ?? 0),
      ]),
    );

    const adjustmentsByAccount = new Map(
      adjustmentTotals.map((item) => [
        item.financialAccountId,
        toCents(item._sum.amount ?? 0),
      ]),
    );

    return accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) ?? { income: 0, expenses: 0 };
      const incomingTransfers = incomingTransfersByAccount.get(account.id) ?? 0;
      const outgoingTransfers = outgoingTransfersByAccount.get(account.id) ?? 0;
      const adjustments = adjustmentsByAccount.get(account.id) ?? 0;
      const currentBalanceCents =
        toCents(account.initialBalance) +
        totals.income -
        totals.expenses +
        incomingTransfers -
        outgoingTransfers +
        adjustments;

      return {
        ...account,
        currentBalance: centsToFixed(currentBalanceCents),
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

  private async getEffectiveBalanceCents(
    userId: string,
    account: FinancialAccountSummary,
    accountId: string,
    beforeDate?: Date,
  ) {
    const effectiveMovementWhere = buildEffectivePendingMovementWhere(
      userId,
      beforeDate,
    );
    const adjustmentDateLimit = getEffectiveDateLimit(beforeDate);

    const [
      transactionTotals,
      outgoingTransferTotals,
      incomingTransferTotals,
      adjustmentTotals,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: {
          ...effectiveMovementWhere,
          financialAccountId: accountId,
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: {
          ...effectiveMovementWhere,
          fromAccountId: accountId,
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: {
          ...effectiveMovementWhere,
          toAccountId: accountId,
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.balanceAdjustment.groupBy({
        by: ['financialAccountId'],
        where: {
          userId,
          financialAccountId: accountId,
          date: { lt: adjustmentDateLimit },
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const transactionBalanceCents = transactionTotals.reduce((total, item) => {
      const amountCents = toCents(item._sum.amount ?? 0);

      return item.type === TransactionType.INCOME
        ? total + amountCents
        : total - amountCents;
    }, 0);
    const outgoingTransfersCents = outgoingTransferTotals.reduce(
      (total, item) => total + toCents(item._sum.amount ?? 0),
      0,
    );
    const incomingTransfersCents = incomingTransferTotals.reduce(
      (total, item) => total + toCents(item._sum.amount ?? 0),
      0,
    );
    const adjustmentsCents = adjustmentTotals.reduce(
      (total, item) => total + toCents(item._sum.amount ?? 0),
      0,
    );

    return (
      toCents(account.initialBalance) +
      transactionBalanceCents +
      incomingTransfersCents -
      outgoingTransfersCents +
      adjustmentsCents
    );
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
      throw new NotFoundException('Conta financeira não encontrada!');
    }

    await this.confirmOverduePendingMovements(userId);

    const dateFilter = buildLedgerDateFilter(filters);
    const dateWhere = dateFilter ? { date: dateFilter } : {};
    const ledgerStartDate = filters.startDate
      ? toLocalDate(filters.startDate)
      : undefined;

    const [
      accountWithBalance,
      openingBalanceCents,
      transactions,
      transfers,
      adjustments,
    ] =
      await Promise.all([
        this.withCurrentBalance(userId, account),
        ledgerStartDate
          ? this.getEffectiveBalanceCents(
              userId,
              account,
              accountId,
              ledgerStartDate,
            )
          : Promise.resolve(toCents(account.initialBalance)),
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

    const transactionItems: AccountLedgerItemInternal[] = transactions.map((transaction) => {
      const isIncome = transaction.type === TransactionType.INCOME;
      const amountCents = toCents(transaction.amount);
      const signedAmountCents = isIncome ? amountCents : -amountCents;
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
        amount: centsToFixed(amountCents),
        signedAmount: centsToFixed(signedAmountCents),
        signedAmountCents,
        affectsCurrentBalance: affectsCurrentPendingBalance(
          transaction.date,
          transaction.isPending,
        ),
        isPending: transaction.isPending,
        transactionType: transaction.type,
        category: transaction.category,
      };
    });

    const transferItems: AccountLedgerItemInternal[] = transfers.map((transfer) => {
      const isIncoming = transfer.toAccountId === accountId;
      const relatedAccount = isIncoming ? transfer.fromAccount : transfer.toAccount;
      const amountCents = toCents(transfer.amount);
      const signedAmountCents = isIncoming ? amountCents : -amountCents;

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
        amount: centsToFixed(amountCents),
        signedAmount: centsToFixed(signedAmountCents),
        signedAmountCents,
        affectsCurrentBalance: affectsCurrentPendingBalance(
          transfer.date,
          transfer.isPending,
        ),
        isPending: transfer.isPending,
        relatedAccount,
      };
    });

    const adjustmentItems: AccountLedgerItemInternal[] = adjustments.map((adjustment) => {
      const signedAmountCents = toCents(adjustment.amount);

      return {
        id: `balance-adjustment:${adjustment.id}`,
        sourceId: adjustment.id,
        sourceType: 'BALANCE_ADJUSTMENT',
        movementType: 'BALANCE_ADJUSTMENT',
        date: adjustment.date,
        createdAt: adjustment.createdAt,
        title: adjustment.reason,
        description: null,
        amount: centsToFixed(signedAmountCents),
        signedAmount: centsToFixed(signedAmountCents),
        signedAmountCents,
        affectsCurrentBalance: affectsCurrentAdjustmentBalance(adjustment.date),
        isPending: false,
      };
    });

    const items = [
      ...transactionItems,
      ...transferItems,
      ...adjustmentItems,
    ].sort((a, b) => {
      const dateDiff = b.date.getTime() - a.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const chronologicalItems = [...items].sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let runningBalanceCents = openingBalanceCents;
    for (const item of chronologicalItems) {
      if (item.affectsCurrentBalance) {
        runningBalanceCents += item.signedAmountCents;
      }

      item.balanceAfter = centsToFixed(runningBalanceCents);
    }

    const closingBalanceCents = runningBalanceCents;

    const totals = items.reduce(
      (acc, item) => {
        const signedAmountCents = item.signedAmountCents;
        acc.netChangeCents += signedAmountCents;

        if (item.affectsCurrentBalance) {
          acc.effectiveNetChangeCents += signedAmountCents;
        }

        if (item.isPending) {
          acc.pendingCount += 1;
        }

        if (item.movementType === 'TRANSACTION_INCOME') {
          acc.incomeCents += signedAmountCents;
        } else if (item.movementType === 'TRANSACTION_EXPENSE') {
          acc.expensesCents += Math.abs(signedAmountCents);
        } else if (item.movementType === 'TRANSFER_IN') {
          acc.incomingTransfersCents += signedAmountCents;
        } else if (item.movementType === 'TRANSFER_OUT') {
          acc.outgoingTransfersCents += Math.abs(signedAmountCents);
        } else if (item.movementType === 'BALANCE_ADJUSTMENT') {
          acc.adjustmentsCents += signedAmountCents;
        }

        return acc;
      },
      {
        incomeCents: 0,
        expensesCents: 0,
        incomingTransfersCents: 0,
        outgoingTransfersCents: 0,
        adjustmentsCents: 0,
        netChangeCents: 0,
        effectiveNetChangeCents: 0,
        pendingCount: 0,
      },
    );

    const responseItems: AccountLedgerItem[] = items.map((item) => {
      const { signedAmountCents, balanceAfter, ...responseItem } = item;

      return {
        ...responseItem,
        balanceAfter: balanceAfter ?? centsToFixed(openingBalanceCents),
      };
    });

    return {
      account: accountWithBalance,
      filters: {
        startDate: filters.startDate ?? null,
        endDate: filters.endDate ?? null,
      },
      openingBalance: centsToFixed(openingBalanceCents),
      closingBalance: centsToFixed(closingBalanceCents),
      totals: {
        income: centsToFixed(totals.incomeCents),
        expenses: centsToFixed(totals.expensesCents),
        incomingTransfers: centsToFixed(totals.incomingTransfersCents),
        outgoingTransfers: centsToFixed(totals.outgoingTransfersCents),
        adjustments: centsToFixed(totals.adjustmentsCents),
        netChange: centsToFixed(totals.netChangeCents),
        effectiveNetChange: centsToFixed(totals.effectiveNetChangeCents),
        pendingCount: totals.pendingCount,
      },
      items: responseItems,
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
