import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    transaction: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      category: {
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      transaction: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('archives a category when it has linked transactions', async () => {
    const archivedCategory = {
      id: 'category-1',
      name: 'Alimentacao',
      icon: '🍔',
      isArchived: true,
      createdAt: new Date(),
    };

    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.transaction.count.mockResolvedValue(2);
    prisma.category.update.mockResolvedValue(archivedCategory);

    await expect(service.remove('user-1', 'category-1')).resolves.toEqual({
      message: 'Categoria arquivada para preservar transações existentes.',
      archived: true,
      deleted: false,
      category: archivedCategory,
    });

    expect(prisma.transaction.count).toHaveBeenCalledWith({
      where: {
        categoryId: 'category-1',
        userId: 'user-1',
      },
    });
    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'category-1', userId: 'user-1' },
        data: { isArchived: true },
      }),
    );
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('deletes a category without linked transactions', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.transaction.count.mockResolvedValue(0);
    prisma.category.delete.mockResolvedValue({ id: 'category-1' });

    await expect(service.remove('user-1', 'category-1')).resolves.toEqual({
      message: 'Categoria removida com sucesso!',
      archived: false,
      deleted: true,
    });

    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: 'category-1', userId: 'user-1' },
    });
  });

  it('does not update a category from another user', async () => {
    prisma.category.update.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.update('user-1', 'category-2', { name: 'Saude' }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'category-2', userId: 'user-1' },
        data: { name: 'Saude' },
      }),
    );
  });

  it('does not archive a category from another user', async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(service.remove('user-1', 'category-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });
});
