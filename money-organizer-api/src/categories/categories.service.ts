
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}
  
  async create(userId: string, dto: CreateCategoryDto) {
    return await this.prisma.category.create({
      data: {
        ...dto,
        userId,
        },
        select: {
            id: true,
            name: true,
            icon: true,
            createdAt: true,
        }
    });
  }

    async findAll(userId: string) {
        return await this.prisma.category.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                icon: true,
                createdAt: true,
            },
            orderBy: { name: 'asc' }, 
        });
    }

    async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
        try {
            const category = await this.prisma.category.findUnique({
                where: { id: categoryId, userId, },
            });


            return await this.prisma.category.update({
                where: { id: categoryId, userId, },
                data: dto,
                select: {
                    id: true,
                    name: true,
                    icon: true,
                    createdAt: true,
                }
            })
        } catch (error: any) {
            if (error?.code == 'P2025') {
                throw new NotFoundException('Categoria NÃO encontrada!');
            }
        }
    }


    async remove(userId: string, categoryId: string) {
        try { 
            const category = await this.prisma.category.findUnique({
                where: { id: categoryId, userId, },
            });

            await this.prisma.category.delete({
                where: { id: categoryId, userId, },
            });

            return { message: 'Categoria deletada com sucesso!' };
        } catch(error: any) {
            if (error?.code == 'P2025') {
                throw new NotFoundException('Categoria NÃO encontrada!');
            }
        }
    }   


}
