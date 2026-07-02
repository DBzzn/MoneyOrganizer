import { HttpException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginAttemptService } from './login-attempt.service';
import { TokenRevocationService } from './token-revocation.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };
  let jwt: {
    sign: jest.Mock;
  };
  let tokenRevocation: TokenRevocationService;
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        LoginAttemptService,
        TokenRevocationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: JwtService,
          useValue: jwt,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    tokenRevocation = module.get<TokenRevocationService>(TokenRevocationService);
    mockedBcrypt.compare.mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('validates users without returning the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password: 'stored-hash',
    });

    await expect(
      service.validateUser(' USER@Example.COM ', 'password'),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });
  });

  it('uses a generic auth error and dummy bcrypt comparison for missing users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(
      service.validateUser('missing@example.com', 'password'),
    ).rejects.toThrow(UnauthorizedException);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'password',
      expect.stringMatching(/^\$2b\$10\$/),
    );
  });

  it('signs login tokens with a revocable token id', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password: 'stored-hash',
    });

    await expect(service.login('user@example.com', 'password')).resolves.toEqual({
      access_token: 'signed-token',
    });

    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'user@example.com',
      jti: expect.any(String),
    });
  });

  it('limits repeated failed logins by account identifier', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login('victim@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    }

    await expect(
      service.login('victim@example.com', 'wrong-password'),
    ).rejects.toThrow(HttpException);
  });

  it('revokes the current token on logout', () => {
    const revoke = jest.spyOn(tokenRevocation, 'revoke');

    expect(
      service.logout({
        id: 'user-1',
        email: 'user@example.com',
        tokenId: 'token-1',
        tokenExpiresAt: 1_800_000_000,
      }),
    ).toEqual({ message: 'Logout realizado com sucesso.' });

    expect(revoke).toHaveBeenCalledWith('token-1', 1_800_000_000);
  });
});
