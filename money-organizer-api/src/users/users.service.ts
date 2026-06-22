import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryKind,
  FinancialAccountType,
  Prisma,
} from '../../generated/prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

const DEFAULT_CATEGORIES = [
  { name: 'Alimentação', icon: 'lucide:utensils', kind: CategoryKind.EXPENSE },
  { name: 'Transporte', icon: 'lucide:bus', kind: CategoryKind.EXPENSE },
  { name: 'Moradia', icon: 'lucide:house', kind: CategoryKind.EXPENSE },
  { name: 'Saúde', icon: 'lucide:heart-pulse', kind: CategoryKind.EXPENSE },
  { name: 'Lazer', icon: 'lucide:gamepad-2', kind: CategoryKind.EXPENSE },
  { name: 'Salário', icon: 'lucide:badge-dollar-sign', kind: CategoryKind.INCOME },
  { name: 'Investimentos', icon: 'lucide:chart-line', kind: CategoryKind.BOTH }
];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  async create(dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
        await this.prisma.category.createMany({
            data: DEFAULT_CATEGORIES.map((category) => ({
                ...category,
                userId: user.id,
            })),
        });

        await this.prisma.financialAccount.create({
            data: {
                name: 'Conta inicial',
                type: FinancialAccountType.BANK_ACCOUNT,
                initialBalance: new Prisma.Decimal(0),
                includeInDashboard: true,
                userId: user.id,
            },
        });

        return user;
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('O Email já Existe!');
      }
      throw error;
    }
  }
}
