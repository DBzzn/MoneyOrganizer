import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenRevocationService {
  private readonly revokedTokens = new Map<string, number>();

  revoke(tokenId: string, expiresAtSeconds?: number): void {
    if (!tokenId) {
      return;
    }

    const expiresAt = expiresAtSeconds
      ? expiresAtSeconds * 1000
      : Date.now() + 24 * 60 * 60_000;

    this.cleanupExpiredTokens();
    this.revokedTokens.set(tokenId, expiresAt);
  }

  isRevoked(tokenId: string): boolean {
    this.cleanupExpiredTokens();
    return this.revokedTokens.has(tokenId);
  }

  private cleanupExpiredTokens(now = Date.now()): void {
    for (const [tokenId, expiresAt] of this.revokedTokens.entries()) {
      if (expiresAt <= now) {
        this.revokedTokens.delete(tokenId);
      }
    }
  }
}
