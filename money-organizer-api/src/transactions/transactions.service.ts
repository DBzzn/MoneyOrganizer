/* eslint-disable prettier/prettier */
import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateInstallmentsDto } from './dto/create-installments.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { FinancialAccountType, ImportedMovementStatus, TransactionType, Prisma } from '../../generated/prisma/client';
import { randomUUID } from 'crypto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ReportFiltersDto } from './dto/report-filters.dto';


function removeUndefined<T extends object>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as Partial<T>;
}

function toLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0)
}

function endOfLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d, 23, 59, 59, 999)
}

function startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function withCurrentPendingStatus<T extends { date: Date; isPending: boolean }>(transaction: T): T {
    if (!transaction.isPending || transaction.date >= startOfToday()) {
        return transaction;
    }

    return {
        ...transaction,
        isPending: false,
    };
}

const DEFAULT_FINANCIAL_ACCOUNT_NAME = 'Conta inicial';

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

interface FinancialAccountFilterInput {
    financialAccountId?: string;
    financialAccountIds?: string[];
}

@Injectable()
export class TransactionsService {
    constructor(private readonly prisma: PrismaService) { }

    private async confirmOverduePendingTransactions(userId: string) {
        await this.prisma.transaction.updateMany({
            where: {
                userId,
                isPending: true,
                date: { lt: startOfToday() },
            },
            data: { isPending: false },
        });
    }

    private async getOrCreateDefaultFinancialAccountId(userId: string): Promise<string> {
        const existingAccount = await this.prisma.financialAccount.findFirst({
            where: {
                userId,
                name: DEFAULT_FINANCIAL_ACCOUNT_NAME,
            },
            select: { id: true },
        });

        if (existingAccount) {
            return existingAccount.id;
        }

        const account = await this.prisma.financialAccount.create({
            data: {
                name: DEFAULT_FINANCIAL_ACCOUNT_NAME,
                type: FinancialAccountType.BANK_ACCOUNT,
                initialBalance: new Prisma.Decimal(0),
                includeInDashboard: true,
                userId,
            },
            select: { id: true },
        });

        return account.id;
    }

    private async resolveFinancialAccountId(
        userId: string,
        financialAccountId?: string,
    ): Promise<string> {
        if (!financialAccountId) {
            return this.getOrCreateDefaultFinancialAccountId(userId);
        }

        const account = await this.prisma.financialAccount.findFirst({
            where: {
                id: financialAccountId,
                userId,
                isArchived: false,
            },
            select: { id: true },
        });

        if (!account) {
            throw new BadRequestException('Conta financeira não encontrada!');
        }

        return account.id;
    }

    private async ensureCategoryAvailable(
        userId: string,
        categoryId: string,
        currentCategoryId?: string,
    ) {
        const category = await this.prisma.category.findFirst({
            where: {
                id: categoryId,
                userId,
                ...(categoryId === currentCategoryId ? {} : { isArchived: false }),
            },
            select: { id: true },
        });

        if (!category) {
            throw new BadRequestException('Categoria não encontrada ou arquivada!');
        }
    }

    private async getFinancialAccountIdsFilter(
        userId: string,
        filters?: FinancialAccountFilterInput,
    ): Promise<string[] | undefined> {
        const requestedIds = [
            ...(filters?.financialAccountId ? [filters.financialAccountId] : []),
            ...(filters?.financialAccountIds ?? []),
        ]
            .map((id) => id.trim())
            .filter(Boolean);

        const uniqueIds = [...new Set(requestedIds)];

        if (uniqueIds.length === 0) {
            return undefined;
        }

        const accounts = await this.prisma.financialAccount.findMany({
            where: {
                id: { in: uniqueIds },
                userId,
            },
            select: { id: true },
        });

        if (accounts.length !== uniqueIds.length) {
            throw new BadRequestException('Uma ou mais contas financeiras não foram encontradas!');
        }

        return uniqueIds;
    }

    async create(userId: string, dto: CreateTransactionDto) {
        await this.ensureCategoryAvailable(userId, dto.categoryId);

        const financialAccountId = await this.resolveFinancialAccountId(
            userId,
            dto.financialAccountId,
        );

        //Parcelamento
        if (dto.type === TransactionType.CREDIT_INSTALLMENT) {
            if (!dto.totalInstallments || !dto.currentInstallment) {
                throw new BadRequestException('Compras Parceladas PRECISAM de todos os dados das Parcelas!');
            }

            if (dto.currentInstallment > dto.totalInstallments) {
                throw new BadRequestException('A parcela atual não pode ser maior que o total de parcelas!');
            }

            if (!dto.installmentGroupId) {
                dto.installmentGroupId = randomUUID();
            }
        } else {
            dto.totalInstallments = undefined;
            dto.currentInstallment = undefined;
            dto.installmentGroupId = undefined;
        }

        const transaction = await this.prisma.transaction.create({
            data: {
                type: dto.type,
                amount: new Prisma.Decimal(dto.amount),
                date: toLocalDate(dto.date),
                isPending: dto.isPending ?? false,
                description: dto.description,
                totalInstallments: dto.totalInstallments,
                currentInstallment: dto.currentInstallment,
                installmentGroupId: dto.installmentGroupId,
                categoryId: dto.categoryId,
                financialAccountId,
                userId: userId,
            },
            select: {
                id: true,
                type: true,
                amount: true,
                date: true,
                isPending: true,
                description: true,
                totalInstallments: true,
                currentInstallment: true,
                installmentGroupId: true,   
                categoryId: true,
                financialAccountId: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                        isArchived: true,
                    }
                },
                financialAccount: {
                    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
                },
                importedMovements: {
                    select: IMPORT_SOURCE_SELECT,
                },
            }
        });

        return transaction;

    }

    async findAll(userId: string, filters: QueryTransactionsDto)

    {
        await this.confirmOverduePendingTransactions(userId);

        const where: any = { userId }

        if (filters.startDate) {
            where.date = { ...where.date, gte: toLocalDate(filters.startDate) };
        }

        if (filters.endDate) {
            where.date = { ...where.date, lte: endOfLocalDate(filters.endDate) };
        }

        if (filters.categoryId) {
            where.categoryId = filters.categoryId;
        }

        const financialAccountIds = await this.getFinancialAccountIdsFilter(userId, filters);

        if (financialAccountIds) {
            where.financialAccountId = { in: financialAccountIds };
        }

        if (filters.type) {
            where.type = filters.type;
        }

        if (filters.isPending !== undefined) {
            where.isPending = filters.isPending;
        }

        if (filters.search) {
            where.description = { contains: filters.search, mode: 'insensitive' };
        }

        if (filters.minAmount !== undefined || filters.maxAmount != undefined) {
            where.amount = {};
            if (filters.minAmount !== undefined) {
                where.amount.gte = filters.minAmount
            }
            if (filters.maxAmount !== undefined) {
                where.amount.lte = filters.maxAmount
            }
        }

        const transactions = await this.prisma.transaction.findMany({
            where,
            select: {
                id: true,
                type: true,
                amount: true,
                date: true,
                isPending: true,
                description: true,
                totalInstallments: true,
                currentInstallment: true,
                installmentGroupId: true,
                createdAt: true,
                categoryId: true,
                financialAccountId: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                        isArchived: true,
                    }
                },
                financialAccount: {
                    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
                },
                importedMovements: {
                    select: IMPORT_SOURCE_SELECT,
                },
            },
            orderBy: {
                date: 'desc',
            }
        });
        

        return transactions.map(withCurrentPendingStatus);
    }

    async getTotalsByCategory(userId: string, filters?: QueryTransactionsDto) {
        await this.confirmOverduePendingTransactions(userId);

        const where: any = { userId };

        if (filters?.startDate) {
            where.date = { ...where.date, gte: toLocalDate(filters.startDate) };
        }

        if (filters?.endDate) {
            where.date = { ...where.date, lte: endOfLocalDate(filters.endDate) };
        }

        if (filters?.type) {
            where.type = filters.type;
        }

        const financialAccountIds = await this.getFinancialAccountIdsFilter(userId, filters);

        if (financialAccountIds) {
            where.financialAccountId = { in: financialAccountIds };
        }

        if (filters?.isPending !== undefined) {
            where.isPending = filters.isPending;
        }


        const aggregations = await this.prisma.transaction.groupBy({
            by: ['categoryId'],
            where,
            _sum: {
                amount: true,
            },
            _count: {
                id: true,
            },
        });

        const categories = await this.prisma.category.findMany({
            where: {
                id: { in: aggregations.map((agg) => agg.categoryId) },
                userId,
            },
            select: {
                id: true,
                name: true,
                icon: true,
            },
        });

        const categoriesById = new Map(
            categories.map((category) => [category.id, category])
        );

        const totals = aggregations.map((agg) => {
            const category = categoriesById.get(agg.categoryId);

            return {
                categoryId: agg.categoryId,
                categoryName: category?.name || 'Categoria não encontrada',
                categoryIcon: category?.icon || null,
                totalAmount: agg._sum.amount?.toString() || '0',
                transactionCount: agg._count.id,
            };
        });

        return totals.sort((a, b) =>
            parseFloat(b.totalAmount) - parseFloat(a.totalAmount)
        );


    }

    async findOne(userId: string, transactionId: string) {
        await this.confirmOverduePendingTransactions(userId);

        const transaction = await this.prisma.transaction.findFirst({
            where: {
                id: transactionId,
                userId: userId,
            },
            select: {
                id: true,
                type: true,
                amount: true,
                date: true,
                isPending: true,
                description: true,
                totalInstallments: true,
                currentInstallment: true,
                installmentGroupId: true,
                categoryId: true,
                financialAccountId: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                        isArchived: true,
                    },
                },
                financialAccount: {
                    select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
                },
                importedMovements: {
                    select: IMPORT_SOURCE_SELECT,
                },
                createdAt: true,
            },
        });

        if (!transaction) {
            throw new NotFoundException('Transação não encontrada!');
        }

        return transaction;    
    }

    async update(
        userId: string,
        transactionId: string,
        dto: UpdateTransactionDto
    ) {
        if (dto.categoryId) {
            const transaction = await this.prisma.transaction.findFirst({
                where: {
                    id: transactionId,
                    userId,
                },
                select: { categoryId: true },
            });

            if (!transaction) {
                throw new NotFoundException('Transação não encontrada!');
            }

            await this.ensureCategoryAvailable(
                userId,
                dto.categoryId,
                transaction.categoryId,
            );
        }

        if (dto.financialAccountId) {
            await this.resolveFinancialAccountId(userId, dto.financialAccountId);
        }

        const data = removeUndefined({ // remove o que não foi passado para atualizar com o que foi
            type:        dto.type,
            amount:      dto.amount         !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
            date:        dto.date           !== undefined ? new Date (toLocalDate(dto.date)) : undefined,
            isPending:   dto.isPending,
            description: dto.description,
            category:    dto.categoryId     !== undefined ? { connect: {id: dto.categoryId } } : undefined,
            financialAccount: dto.financialAccountId !== undefined ? { connect: { id: dto.financialAccountId } } : undefined,
        });
       

        try {
            const transacation = await this.prisma.transaction.update({
                where: {
                    id: transactionId,
                    userId: userId,
                },
                data,
                select: {
                    id: true,
                    type: true,
                    amount: true,
                    date: true,
                    isPending: true,
                    description: true,
                    totalInstallments: true,
                    currentInstallment: true,
                    installmentGroupId: true,
                    createdAt: true,
                    categoryId: true,
                    financialAccountId: true,
                    category: {
                        select: {
                            id: true,
                            name: true,
                            icon: true,
                            isArchived: true,
                        }
                    },
                    financialAccount: {
                        select: FINANCIAL_ACCOUNT_SUMMARY_SELECT,
                    },
                    importedMovements: {
                        select: IMPORT_SOURCE_SELECT,
                    },
                }
            });

            return transacation;
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new NotFoundException('Transação não encontrada!');
            }
            throw error;
        }
    }

    async remove(userId: string, ids: string | string[]) {
        const transactionIds = Array.isArray(ids) ? ids : [ids];
        const uniqueIds = [...new Set(transactionIds)];

        if (uniqueIds.length === 0) {
            throw new BadRequestException('Informe ao menos uma transação para deletar.');
        }

        await this.prisma.$transaction(async (tx) => {
            const found = await tx.transaction.findMany({
                where: {
                    id: { in: uniqueIds },
                    userId,
                },
                select: { id: true }
            });

            if (found.length !== uniqueIds.length) {
                throw new NotFoundException(
                    'Uma ou mais transações não foram encontradas ou não pertencem ao usuário.'
                )
            }

            const importedMovementCount = await tx.importedMovement.count({
                where: {
                    userId,
                    status: ImportedMovementStatus.APPLIED,
                    appliedTransactionId: { in: uniqueIds },
                },
            });

            if (importedMovementCount > 0) {
                throw new BadRequestException(
                    'Transacao criada por importacao nao pode ser excluida diretamente. Mantenha a rastreabilidade ate existir um fluxo de desfazer para importacoes.',
                );
            }

            const deleted = await tx.transaction.deleteMany({
                where: {
                    id: { in: uniqueIds },
                    userId,
                },
            });

            if (deleted.count !== uniqueIds.length) {
                throw new NotFoundException(
                    'Uma ou mais transações não foram encontradas ou não pertencem ao usuário.'
                );
            }
        });

        if (uniqueIds.length === 1) {
            return { message: 'Transação deletada com sucesso!' };
        }

        return { message: `${uniqueIds.length} transação(ões) deletada(s) com sucesso.` };
    }

    async createInstallment(userId: string, dto: CreateInstallmentsDto) {
        if (dto.totalAmount && dto.installmentAmount) {
            throw new BadRequestException('Forneça apenas o valor total ou o valor da parcela, não ambos!');
        }

        if (!dto.totalAmount && !dto.installmentAmount) {
            throw new BadRequestException('Forneça pelo menos o valor total ou o valor da parcela!');
        }

        await this.ensureCategoryAvailable(userId, dto.categoryId);

        const financialAccountId = await this.resolveFinancialAccountId(
            userId,
            dto.financialAccountId,
        );

        let baseAmountCents: number;
        let totalToDistributeCents: number;

        if (dto.totalAmount) {
            totalToDistributeCents = Math.round(dto.totalAmount * 100);
            baseAmountCents = Math.floor(totalToDistributeCents / dto.totalInstallments);
        } else {
            baseAmountCents = Math.round(dto.installmentAmount! * 100);
            totalToDistributeCents = baseAmountCents * dto.totalInstallments;
        }

        if (baseAmountCents < 1) {
            throw new BadRequestException('O valor total é pequeno demais para o número de parcelas.');
        }

        const installmentGroupId = randomUUID();
        const firstDate = toLocalDate(dto.firstInstallmentDate);

        const installmentsData: Array<{
            type: TransactionType;
            amount: number;
            date: Date;
            isPending: boolean;
            description: string | null;
            totalInstallments: number;
            currentInstallment: number;
            installmentGroupId: string;
            categoryId: string;
            financialAccountId: string;
            userId: string;
        }> = [];

        let accumulatedAmountCents = 0;

        for (let i = 1; i <= dto.totalInstallments; i++) {
            const installmentDate = new Date(firstDate);
            installmentDate.setMonth(firstDate.getMonth() + (i - 1));

            let currentAmountCents: number;

            if (i === dto.totalInstallments) {
                currentAmountCents = totalToDistributeCents - accumulatedAmountCents;
            } else {
                currentAmountCents = baseAmountCents;
                accumulatedAmountCents += currentAmountCents;
            }

            installmentsData.push({
                type: TransactionType.CREDIT_INSTALLMENT,
                amount: currentAmountCents / 100,
                date: installmentDate,
                isPending: dto.isPending || false,
                description: dto.description || null,
                totalInstallments: dto.totalInstallments,
                currentInstallment: i,
                installmentGroupId: installmentGroupId,
                categoryId: dto.categoryId,
                financialAccountId,
                userId: userId,
            });
        }

        const createdInstallments = await this.prisma.$transaction(
            installmentsData.map((data) => this.prisma.transaction.create({ data }))
        );

        return {
            message: `${dto.totalInstallments} parcelas criadas com sucesso!`,
            installmentGroupId: installmentGroupId,
            totalInstallments: dto.totalInstallments,
            installmentValue: (baseAmountCents / 100).toFixed(2),
            installments: createdInstallments.map((installment) => ({
                id: installment.id,
                currentInstallment: installment.currentInstallment,
                date: installment.date,
                amount: installment.amount.toString(),
            }))

        }

    }

    async getMonthlyBalance(userId: string, filters: ReportFiltersDto) {
        await this.confirmOverduePendingTransactions(userId);

        const month = filters.month || new Date().toISOString().slice(0, 7); // formato YYYY-MM
        const [year, monthNum] = month.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);
        const financialAccountIds = await this.getFinancialAccountIdsFilter(userId, filters);

        const where: Prisma.TransactionWhereInput = {
            userId,
            date: {
                gte: startDate,
                lte: endDate,
            },
        };

        if (financialAccountIds) {
            where.financialAccountId = { in: financialAccountIds };
        }

        const transactions = await this.prisma.transaction.findMany({
            where,
            select: {
                type: true,
                amount: true,
            },
        });

        let income = 0;
        let expenses = 0;
        let incomeCount = 0;
        let expensesCount = 0;

        transactions.forEach((tx) => {
            const amount = parseFloat(tx.amount.toString());

            if (tx.type === TransactionType.INCOME) {
                income += amount;
                incomeCount++;
            } else {
                expenses += amount;
                expensesCount++;
            }
        });

        const balance = income - expenses;

        return {
            month,
            income: income.toFixed(2),
            expenses: expenses.toFixed(2),
            balance: balance.toFixed(2),
            transactionCount: {
                income: incomeCount,
                expenses: expensesCount,
                total: transactions.length,
            },
        };
    }

    async getEvolution(userId: string, filters: ReportFiltersDto) {
        await this.confirmOverduePendingTransactions(userId);

        const endMonth = filters.endMonth || new Date().toISOString().slice(0, 7)

        let startMonth: string;
        if (filters.startMonth) {
            startMonth = filters.startMonth;
        } else {
            const date = new Date();
            date.setMonth(date.getMonth() - 5);
            startMonth = date.toISOString().slice(0,7)
        }

        const [startYear, startMonthNum] = startMonth.split('-').map(Number);
        const [endYear, endMonthNum] = endMonth.split('-').map(Number);

        const startDate = new Date(startYear, startMonthNum - 1, 1);
        const endDate = new Date(endYear, endMonthNum, 0, 23, 59, 59)
        const financialAccountIds = await this.getFinancialAccountIdsFilter(userId, filters);

        const where: Prisma.TransactionWhereInput = {
            userId,
            date: {
                gte: startDate,
                lte: endDate,
            },
        };

        if (financialAccountIds) {
            where.financialAccountId = { in: financialAccountIds };
        }

        const transactions = await this.prisma.transaction.findMany({
            where,
            select: {
                type: true,
                amount: true,
                date: true,
            },
            orderBy: {
                date: 'asc',
            },
        });

        const monthsMap = new Map<string, { income: number; expenses: number; incomeCount: number; expensesCount: number }>();

        const currentDate = new Date(startYear, startMonthNum - 1, 1);
        const finalDate = new Date(endYear, endMonthNum - 1, 1);

        while (currentDate <= finalDate) {
            const monthKey = currentDate.toISOString().slice(0, 7);
            monthsMap.set(monthKey, { income: 0, expenses: 0, incomeCount: 0, expensesCount: 0 });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        transactions.forEach((tx) => {
            const monthKey = tx.date.toISOString().slice(0, 7)
            const monthData = monthsMap.get(monthKey);

            if (monthData) {
                const amount = parseFloat(tx.amount.toString());

                if (tx.type === TransactionType.INCOME) {
                    monthData.income += amount;
                    monthData.incomeCount++;
                } else {
                    monthData.expenses += amount;
                    monthData.expensesCount++;
                }

            }
        });

        const evolution = Array.from(monthsMap.entries()).map(([month, data]) => ({
            month,
            income: data.income.toFixed(2),
            expenses: data.expenses.toFixed(2),
            balance: (data.income - data.expenses).toFixed(2),
            transactionCount: {
                income: data.incomeCount,
                expenses: data.expensesCount,
                total: data.incomeCount + data.expensesCount,

            },
        }));

        return evolution;
    }

    async getProjection(userId: string, filters: ReportFiltersDto) {
        await this.confirmOverduePendingTransactions(userId);

        const startMonth = filters.startMonth || new Date().toISOString().slice(0, 7);

        let endMonth: string;
        if (filters.endMonth) {
            endMonth = filters.endMonth;
        } else {
            const date = new Date();
            date.setMonth(date.getMonth() + 5);
            endMonth = date.toISOString().slice(0, 7);
        }

        const [startYear, startMonthNum] = startMonth.split('-').map(Number);
        const [endYear, endMonthNum] = endMonth.split('-').map(Number);

        const startDate = new Date(startYear, startMonthNum - 1, 1)
        const endDate = new Date(endYear, endMonthNum, 0, 23, 59, 59)
        const financialAccountIds = await this.getFinancialAccountIdsFilter(userId, filters);

        const where: Prisma.TransactionWhereInput = {
            userId,
            date: {
                gte: startDate,
                lte: endDate,
            },
        };

        if (financialAccountIds) {
            where.financialAccountId = { in: financialAccountIds };
        }


        const transactions = await this.prisma.transaction.findMany({
            where,
            select: {
                type: true,
                amount: true,
                date: true,
                isPending: true,
            },
            orderBy: {
                date: 'asc'
            }

        });

        const monthsMap = new Map<string, {
            confirmedIncome: number;
            confirmedExpenses: number;
            pendingIncome: number;
            pendingExpenses: number;
            pendingCount: number;
        }>();

        const currentDate = new Date(startYear, startMonthNum - 1, 1);
        const finalDate = new Date(endYear, endMonthNum - 1, 1);

        while (currentDate <= finalDate) {
            const monthKey = currentDate.toISOString().slice(0, 7);
            monthsMap.set(monthKey, {
                confirmedIncome: 0,
                confirmedExpenses: 0,
                pendingIncome: 0,
                pendingExpenses: 0,
                pendingCount: 0,
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        transactions.forEach((tx) => {
            const monthKey = tx.date.toISOString().slice(0, 7);
            const monthData = monthsMap.get(monthKey);

            if (monthData) {
                const amount = parseFloat(tx.amount.toString());
                const isIncome = tx.type === TransactionType.INCOME;
                const isPending = tx.isPending;

                if (isIncome) {
                    if (isPending) {
                        monthData.pendingIncome += amount;
                        monthData.pendingCount++;
                    } else {
                        monthData.confirmedIncome += amount;
                    }
                } else {
                    if (isPending) {
                        monthData.pendingExpenses += amount;
                        monthData.pendingCount++;
                    } else {
                        monthData.confirmedExpenses += amount;
                    }
                }
            }
        });

        const projection = Array.from(monthsMap.entries()).map(([month, data]) => {
            const projectedIncome = data.confirmedIncome + data.pendingIncome;
            const projectedExpenses = data.confirmedExpenses + data.pendingExpenses;
            const projectedBalance = projectedIncome - projectedExpenses;

            return {
                month,
                projectedIncome: projectedIncome.toFixed(2),
                projectedExpenses: projectedExpenses.toFixed(2),
                projectedBalance: projectedBalance.toFixed(2),
                pendingTransactions: data.pendingCount,
                details: {
                    confirmedIncome: data.confirmedIncome.toFixed(2),
                    confirmedExpenses: data.confirmedExpenses.toFixed(2),
                    pendingIncome: data.pendingIncome.toFixed(2),
                    pendingExpenses: data.pendingExpenses.toFixed(2),
                },
            };
        });
        return projection;
    }
}
