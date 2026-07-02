import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, JwtAuthPayload } from './auth.types';
import { LoginAttemptService } from './login-attempt.service';
import { TokenRevocationService } from './token-revocation.service';

const AUTH_FAILURE_MESSAGE = 'Credenciais inválidas';
const DUMMY_PASSWORD_HASH =
  '$2b$10$fFjq2p5Cr.Yh3KLkA.daI.TIBV/e4jlaqYZOpzMD8oh0/laQiRtG6';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private loginAttempts: LoginAttemptService,
    private tokenRevocation: TokenRevocationService,
  ) {}

  async validateUser(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    const passwordHash = user?.password ?? DUMMY_PASSWORD_HASH;
    const passwordMatch = await bcrypt.compare(password, passwordHash);

    if (!user || !passwordMatch) {
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE);
    }

    return {
      id: user.id,
      email: user.email,
    };
  }

  async login(email: string, password: string) {
    this.loginAttempts.assertAllowed(email);

    let user: Awaited<ReturnType<AuthService['validateUser']>>;

    try {
      user = await this.validateUser(email, password);
      this.loginAttempts.recordSuccess(email);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.loginAttempts.recordFailure(email);
      }

      throw error;
    }

    const payload: JwtAuthPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };

    return {
      access_token: this.jwt.sign(payload),
    };
  }

  logout(user: AuthenticatedUser) {
    this.tokenRevocation.revoke(user.tokenId, user.tokenExpiresAt);

    return {
      message: 'Logout realizado com sucesso.',
    };
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
        id: true,
        reserveTargetMonths: true,
        createdAt: true,
      },
    });
  }
}
