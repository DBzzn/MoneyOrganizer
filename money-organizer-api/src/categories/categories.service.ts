import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  icon: true,
  isArchived: true,
  createdAt: true,
};

function removeUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto) {
    return await this.prisma.category.create({
      data: {
        ...dto,
        userId,
      },
      select: CATEGORY_SELECT,
    });
  }

  async findAll(userId: string) {
    return await this.prisma.category.findMany({
      where: { userId },
      select: CATEGORY_SELECT,
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
    });
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const data = removeUndefined({
      name: dto.name,
      icon: dto.icon,
      isArchived: dto.isArchived,
    });

    try {
      return await this.prisma.category.update({
        where: { id: categoryId, userId },
        data,
        select: CATEGORY_SELECT,
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Categoria não encontrada!');
      }
      throw error;
    }
  }

  async remove(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada!');
    }

    const linkedTransactions = await this.prisma.transaction.count({
      where: {
        categoryId,
        userId,
      },
    });

    if (linkedTransactions > 0) {
      const archivedCategory = await this.prisma.category.update({
        where: { id: categoryId, userId },
        data: { isArchived: true },
        select: CATEGORY_SELECT,
      });

      return {
        message: 'Categoria arquivada para preservar transações existentes.',
        archived: true,
        deleted: false,
        category: archivedCategory,
      };
    }

    await this.prisma.category.delete({
      where: { id: categoryId, userId },
    });

    return {
      message: 'Categoria removida com sucesso!',
      archived: false,
      deleted: true,
    };
  }
}
