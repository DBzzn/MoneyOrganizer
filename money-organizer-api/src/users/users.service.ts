import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryKind,
  FinancialAccountType,
  Prisma,
} from '../../generated/prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { ConfirmUserPasswordDto } from './dto/confirm-user-password.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import * as bcrypt from 'bcrypt';

const DEFAULT_CATEGORIES = [
  { name: 'Alimentação', icon: 'lucide:utensils', kind: CategoryKind.EXPENSE },
  { name: 'Transporte', icon: 'lucide:bus', kind: CategoryKind.EXPENSE },
  { name: 'Moradia', icon: 'lucide:house', kind: CategoryKind.EXPENSE },
  { name: 'Saúde', icon: 'lucide:heart-pulse', kind: CategoryKind.EXPENSE },
  { name: 'Lazer', icon: 'lucide:gamepad-2', kind: CategoryKind.EXPENSE },
  { name: 'Salário', icon: 'lucide:badge-dollar-sign', kind: CategoryKind.INCOME },
  { name: 'Investimentos', icon: 'lucide:chart-line', kind: CategoryKind.BOTH },
];

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  reserveTargetMonths: true,
  createdAt: true,
};

type UserDefaultsClient = Pick<Prisma.TransactionClient, 'category' | 'financialAccount'>;

type UserDataResetClient = Pick<
  Prisma.TransactionClient,
  | 'importedMovement'
  | 'statementImportFile'
  | 'statementImportBatch'
  | 'reminder'
  | 'balanceAdjustment'
  | 'transfer'
  | 'transaction'
  | 'category'
  | 'financialAccount'
>;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private async createDefaultUserData(db: UserDefaultsClient, userId: string) {
    await db.category.createMany({
      data: DEFAULT_CATEGORIES.map((category) => ({
        ...category,
        userId,
      })),
    });

    await db.financialAccount.create({
      data: {
        name: 'Conta inicial',
        type: FinancialAccountType.BANK_ACCOUNT,
        initialBalance: new Prisma.Decimal(0),
        includeInDashboard: true,
        userId,
      },
    });
  }

  private async deleteUserOwnedData(db: UserDataResetClient, userId: string) {
    const where = { userId };

    await db.importedMovement.deleteMany({ where });
    await db.statementImportFile.deleteMany({ where });
    await db.statementImportBatch.deleteMany({ where });
    await db.reminder.deleteMany({ where });
    await db.balanceAdjustment.deleteMany({ where });
    await db.transfer.deleteMany({ where });
    await db.transaction.deleteMany({ where });
    await db.category.deleteMany({ where });
    await db.financialAccount.deleteMany({ where });
  }

  private async verifyCurrentPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário autenticado não encontrado.');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Senha atual inválida.');
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
        select: USER_SELECT,
      });

      await this.createDefaultUserData(this.prisma, user.id);

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

  async updateProfile(userId: string, dto: UpdateUserProfileDto) {
    const trimmedName = dto.name?.trim();
    const normalizedEmail = dto.email?.trim().toLowerCase();

    if (dto.name !== undefined && !trimmedName) {
      throw new BadRequestException('Informe um nome válido.');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
      },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Usuário autenticado não encontrado.');
    }

    const data: Prisma.UserUpdateInput = {};

    if (trimmedName && trimmedName !== currentUser.name) {
      data.name = trimmedName;
    }

    if (normalizedEmail && normalizedEmail !== currentUser.email) {
      data.email = normalizedEmail;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nenhuma alteração informada.');
    }

    if (!dto.currentPassword) {
      throw new BadRequestException('Digite sua senha atual para confirmar as alterações.');
    }

    const passwordMatch = await bcrypt.compare(dto.currentPassword, currentUser.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Senha atual inválida.');
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data,
        select: USER_SELECT,
      });
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

  async updatePassword(userId: string, dto: UpdateUserPasswordDto) {
    await this.verifyCurrentPassword(userId, dto.currentPassword);

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('A nova senha precisa ser diferente da senha atual.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
      select: { id: true },
    });

    return { message: 'Senha atualizada com sucesso.' };
  }

  async updatePreferences(userId: string, dto: UpdateUserPreferencesDto) {
    if (dto.reserveTargetMonths === undefined) {
      throw new BadRequestException('Informe ao menos uma preferência para salvar.');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        reserveTargetMonths: dto.reserveTargetMonths,
      },
      select: USER_SELECT,
    });
  }

  async clearMyData(userId: string, dto: ConfirmUserPasswordDto) {
    await this.verifyCurrentPassword(userId, dto.password);

    await this.prisma.$transaction(async (tx) => {
      await this.deleteUserOwnedData(tx, userId);
      await this.createDefaultUserData(tx, userId);
    });

    return {
      message: 'Dados limpos com sucesso. Sua conta foi mantida com dados iniciais.',
    };
  }

  async deleteMyAccount(userId: string, dto: ConfirmUserPasswordDto) {
    await this.verifyCurrentPassword(userId, dto.password);

    await this.prisma.$transaction(async (tx) => {
      await this.deleteUserOwnedData(tx, userId);
      await tx.user.delete({
        where: { id: userId },
        select: { id: true },
      });
    });

    return { message: 'Conta excluída com sucesso.' };
  }
}
