import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateInstallmentsDto } from './dto/create-installments.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionType, Prisma } from '../../generated/prisma/client';
import { randomUUID } from 'crypto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ReportFiltersDto } from './dto/report-filters.dto';

@Injectable()
export class TransactionsService {
    constructor(private readonly prisma: PrismaService) { }

    async create(userId: string, dto: CreateTransactionDto) {
        const category = await this.prisma.category.findFirst({
            where: {
                id: dto.categoryId,
                userId: userId,
            }
        });

        if (!category) {
            throw new BadRequestException('Categoria não encontrada!');
        }

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
                date: new Date(dto.date),
                isPending: dto.IsPending ?? false,
                description: dto.description,
                totalInstallments: dto.totalInstallments,
                currentInstallment: dto.currentInstallment,
                installmentGroupId: dto.installmentGroupId,
                categoryId: dto.categoryId,
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
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                    }
                }
            }
        });

        return transaction;

    }

    async findAll(userId: string, filters: QueryTransactionsDto)

    {
        const where: any = { userId }

        if (filters.startDate) {
            where.date = { ...where.date, gte: new Date(filters.startDate) };
        }

        if (filters.endDate) {
            where.date = { ...where.date, lte: new Date(filters.endDate) };
        }

        if (filters.categoryId) {
            where.categoryId = filters.categoryId;
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
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                    }
                }
            },
            orderBy: {
                date: 'desc',
            }
        });
        

        return transactions;
    }

    async getTotalsByCategory(userId: string, filters?: QueryTransactionsDto) {
        const where: any = { userId };

        if (filters?.startDate) {
            where.date = { ...where.date, gte: new Date(filters.startDate) };
        }

        if (filters?.endDate) {
            where.date = { ...where.date, lte: new Date(filters.endDate) };
        }

        if (filters?.type) {
            where.type = filters.type;
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

        const totals = await Promise.all( //espera executar tudo os findUnique em paralelo
            aggregations.map(async (agg) => {
                const category = await this.prisma.category.findUnique({
                    where: { id: agg.categoryId },
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                    }
                });

                return {
                    categoryId: agg.categoryId,
                    categoryName: category?.name || 'Categoria não encontrada',
                    categoryIcon: category?.icon || null,
                    totalAmount: agg._sum.amount?.toString() || '0',
                    transactionCount: agg._count.id,
                };
            })
        );

        return totals.sort((a, b) =>
            parseFloat(b.totalAmount) - parseFloat(a.totalAmount)
        );


    }

    async findOne(userId: string, transactionId: string) {
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
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                    },
                },
                createdAt: true,
            },
        });
    }

    async update(
        userId: string,
        transactionId: string,
        dto: UpdateTransactionDto
    ) {
        if (dto.categoryId) {
            const category = await this.prisma.category.findFirst({
                where: {
                    id: dto.categoryId,
                    userId: userId,
                }
            });
            if (!category) {
                throw new BadRequestException('Categoria não encontrada!');
            }
        }

        const data: any = { ...dto };
        if (dto.amount !== undefined) {
            data.amount = new Prisma.Decimal(dto.amount);
        }

        if (dto.date) {
            data.data = new Date(dto.date);
        }

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
                    category: {
                        select: {
                            id: true,
                            name: true,
                            icon: true,
                        }
                    }
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

    async remove(userId: string, transactionId: string) {
        try {
            await this.prisma.transaction.delete({
                where: {
                    userId: userId,
                    id: transactionId,
                }
            });

            return {
                message: 'Transação deletada com sucesso!',
            }
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new NotFoundException('Transação não encontrada!');
            }

            throw error;
        }

    }

    async createInstallment(userId: string, dto: CreateInstallmentsDto) {
        if (dto.totalAmount && dto.installmentAmount) {
            throw new BadRequestException('Forneça apenas o valor total ou o valor da parcela, não ambos!');
        }

        if (!dto.totalAmount && !dto.installmentAmount) {
            throw new BadRequestException('Forneça pelo menos o valor total ou o valor da parcela!');
        }

        const category = await this.prisma.category.findFirst({
            where: {
                id: dto.categoryId,
                userId,
            }
        });

        if (!category) {
            throw new BadRequestException('Categoria não encontrada!');
        }

        let baseAmountPerInstallment: number;
        let totalToDistribute: number;

        if (dto.totalAmount) {
            totalToDistribute = dto.totalAmount;
            baseAmountPerInstallment = Math.floor((dto.totalAmount / dto.totalInstallments) * 100) / 100;
        } else {
            baseAmountPerInstallment = dto.installmentAmount!;
            totalToDistribute = dto.installmentAmount! * dto.totalInstallments;
        }

        const installmentGroupId = randomUUID();
        const firstDate = new Date(dto.firstInstallmentDate);

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
            userId: string;
        }> = [];

        let accumulatedAmount = 0;

        for (let i = 1; i <= dto.totalInstallments; i++) {
            const installmentDate = new Date(firstDate);
            installmentDate.setMonth(firstDate.getMonth() + (i - 1));

            let currentAmount: number;

            if (i === dto.totalInstallments) {
                currentAmount = totalToDistribute - accumulatedAmount;
                currentAmount = Math.round(currentAmount * 100) / 100;
            } else {
                currentAmount = baseAmountPerInstallment;
                accumulatedAmount += currentAmount;
            }

            installmentsData.push({
                type: TransactionType.CREDIT_INSTALLMENT,
                amount: currentAmount,
                date: installmentDate,
                isPending: dto.isPending || false,
                description: dto.description || null,
                totalInstallments: dto.totalInstallments,
                currentInstallment: i,
                installmentGroupId: installmentGroupId,
                categoryId: dto.categoryId,
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
            installmentValue: baseAmountPerInstallment.toFixed(2),
            installments: createdInstallments.map((installment) => ({
                id: installment.id,
                currentInstallment: installment.currentInstallment,
                date: installment.date,
                amount: installment.amount.toString(),
            }))

        }

    }

    async getMonthlyBalance(userId: string, filters: ReportFiltersDto) {
        const month = filters.month || new Date().toISOString().slice(0, 7); // formato YYYY-MM
        const [year, monthNum] = month.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);

        const transactions = await this.prisma.transaction.findMany({
            where: {
                userId,
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
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

        const transactions = await this.prisma.transaction.findMany({
            where: {
                userId,
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
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


        const transactions = await this.prisma.transaction.findMany({
            where: {
                userId,
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
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