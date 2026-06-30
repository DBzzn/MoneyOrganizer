import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    category: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    financialAccount: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    importedMovement: {
      deleteMany: jest.fn(),
    },
    statementImportFile: {
      deleteMany: jest.fn(),
    },
    statementImportBatch: {
      deleteMany: jest.fn(),
    },
    reminder: {
      deleteMany: jest.fn(),
    },
    balanceAdjustment: {
      deleteMany: jest.fn(),
    },
    transfer: {
      deleteMany: jest.fn(),
    },
    transaction: {
      deleteMany: jest.fn(),
    },
  };

  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

  Object.values(prisma).forEach((delegate) => {
    if (typeof delegate === 'object' && delegate !== null) {
      Object.values(delegate).forEach((method) => {
        if (typeof method === 'function') {
          method.mockResolvedValue({ count: 0 });
        }
      });
    }
  });

  prisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    name: 'Old Name',
    email: 'old@example.com',
    password: 'hashed-password',
  });
  prisma.user.update.mockResolvedValue({
    id: 'user-1',
    name: 'New Name',
    email: 'new@example.com',
    reserveTargetMonths: 6,
    createdAt: new Date('2026-06-23T00:00:00.000Z'),
  });

  return prisma;
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createPrismaMock>;
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedBcrypt.hash.mockResolvedValue('new-hashed-password' as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updates profile name and email after validating the current password', async () => {
    await service.updateProfile('user-1', {
      name: ' New Name ',
      email: ' New@Example.COM ',
      currentPassword: 'current-password',
    });

    expect(bcrypt.compare).toHaveBeenCalledWith('current-password', 'hashed-password');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        name: 'New Name',
        email: 'new@example.com',
      },
      select: {
        id: true,
        name: true,
        email: true,
        reserveTargetMonths: true,
        createdAt: true,
      },
    });
  });

  it('requires the current password before changing profile data', async () => {
    await expect(
      service.updateProfile('user-1', {
        name: 'New Name',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates password only after validating the current password', async () => {
    await service.updatePassword('user-1', {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    });

    expect(bcrypt.compare).toHaveBeenCalledWith('current-password', 'hashed-password');
    expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 10);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { password: 'new-hashed-password' },
      select: { id: true },
    });
  });

  it('updates financial preferences without requiring the current password', async () => {
    await service.updatePreferences('user-1', {
      reserveTargetMonths: 9,
    });

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { reserveTargetMonths: 9 },
      select: {
        id: true,
        name: true,
        email: true,
        reserveTargetMonths: true,
        createdAt: true,
      },
    });
  });

  it('clears user-owned data and recreates the initial account defaults', async () => {
    await service.clearMyData('user-1', { password: 'current-password' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.importedMovement.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.statementImportFile.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.statementImportBatch.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.balanceAdjustment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.transfer.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.category.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.financialAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.category.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ name: 'Alimentação', userId: 'user-1' }),
        expect.objectContaining({ name: 'Salário', userId: 'user-1' }),
      ]),
    });
    expect(prisma.financialAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Conta inicial',
        userId: 'user-1',
        includeInDashboard: true,
      }),
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes user-owned data before deleting the account', async () => {
    await service.deleteMyAccount('user-1', { password: 'current-password' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.importedMovement.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.statementImportFile.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.statementImportBatch.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.balanceAdjustment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.transfer.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.category.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.financialAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true },
    });
    expect(prisma.financialAccount.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.user.delete.mock.invocationCallOrder[0],
    );
  });

  it('does not clear data when the password is invalid', async () => {
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(
      service.clearMyData('user-1', { password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
