import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { TokenRevocationService } from './token-revocation.service';

describe('JwtStrategy', () => {
  let tokenRevocation: TokenRevocationService;
  let strategy: JwtStrategy;

  beforeEach(() => {
    tokenRevocation = new TokenRevocationService();
    strategy = new JwtStrategy(
      { get: jest.fn().mockReturnValue('jwt-secret') } as unknown as ConfigService,
      tokenRevocation,
    );
  });

  it('accepts header bearer JWT payloads with token ids', () => {
    expect(
      strategy.validate({
        sub: 'user-1',
        email: 'user@example.com',
        jti: 'token-1',
        exp: 1_800_000_000,
      }),
    ).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      tokenId: 'token-1',
      tokenExpiresAt: 1_800_000_000,
    });
  });

  it('rejects legacy tokens without a revocable token id', () => {
    expect(() =>
      strategy.validate({
        sub: 'user-1',
        email: 'user@example.com',
        jti: '',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects revoked tokens', () => {
    tokenRevocation.revoke('token-1', 1_800_000_000);

    expect(() =>
      strategy.validate({
        sub: 'user-1',
        email: 'user@example.com',
        jti: 'token-1',
        exp: 1_800_000_000,
      }),
    ).toThrow(UnauthorizedException);
  });
});
