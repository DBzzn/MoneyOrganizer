import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtAuthPayload } from './auth.types';
import { TokenRevocationService } from './token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private tokenRevocation: TokenRevocationService,
  ) {
    const secret = config.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET não configurado.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtAuthPayload) {
    if (!payload.sub || !payload.email || !payload.jti) {
      throw new UnauthorizedException('Token inválido.');
    }

    if (this.tokenRevocation.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Token revogado.');
    }

    return {
      id: payload.sub,
      email: payload.email,
      tokenId: payload.jti,
      tokenExpiresAt: payload.exp,
    };
  }
}
