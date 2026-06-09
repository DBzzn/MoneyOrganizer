import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    transaction: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      category: {
        findUnique: jest.fn(),
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

  it('blocks deletion when the category has linked transactions', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.transaction.count.mockResolvedValue(2);

    await expect(service.remove('user-1', 'category-1')).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.transaction.count).toHaveBeenCalledWith({
      where: {
        categoryId: 'category-1',
        userId: 'user-1',
      },
    });
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });
});
