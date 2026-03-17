import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionType, Prisma } from '../../generated/prisma/client';
import { randomUUID } from 'crypto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

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

}
