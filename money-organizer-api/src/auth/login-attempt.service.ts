import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const ACCOUNT_LOGIN_LIMIT = 5;
const ACCOUNT_LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_THROTTLE_MESSAGE =
  'Credenciais inválidas ou tente novamente mais tarde.';

type LoginAttemptRecord = {
  count: number;
  firstFailedAt: number;
};

@Injectable()
export class LoginAttemptService {
  private readonly attempts = new Map<string, LoginAttemptRecord>();

  assertAllowed(email: string, now = Date.now()): void {
    const key = this.normalizeEmail(email);
    const attempt = this.attempts.get(key);

    if (!attempt) {
      return;
    }

    if (now - attempt.firstFailedAt > ACCOUNT_LOGIN_WINDOW_MS) {
      this.attempts.delete(key);
      return;
    }

    if (attempt.count >= ACCOUNT_LOGIN_LIMIT) {
      throw new HttpException(
        LOGIN_THROTTLE_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(email: string, now = Date.now()): void {
    const key = this.normalizeEmail(email);
    const attempt = this.attempts.get(key);

    if (!attempt || now - attempt.firstFailedAt > ACCOUNT_LOGIN_WINDOW_MS) {
      this.attempts.set(key, { count: 1, firstFailedAt: now });
      return;
    }

    attempt.count += 1;
  }

  recordSuccess(email: string): void {
    this.attempts.delete(this.normalizeEmail(email));
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
