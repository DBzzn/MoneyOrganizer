import 'reflect-metadata';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { AuthController } from './auth/auth.controller';
import { BalanceAdjustmentsController } from './balance-adjustments/balance-adjustments.controller';
import { CategoriesController } from './categories/categories.controller';
import { FinancialAccountsController } from './financial-accounts/financial-accounts.controller';
import { RATE_LIMITS } from './rate-limit.constants';
import { RemindersController } from './reminders/reminders.controller';
import { StatementImportsController } from './statement-imports/statement-imports.controller';
import { TransactionsController } from './transactions/transactions.controller';
import { TransfersController } from './transfers/transfers.controller';
import { UsersController } from './users/users.controller';

type RateLimitConfig = {
  limit: number;
  ttl: number;
};

const defaultLimitKey = `${THROTTLER_LIMIT}default`;
const defaultTtlKey = `${THROTTLER_TTL}default`;

function expectDefaultThrottle(
  method: (...args: never[]) => unknown,
  expected: RateLimitConfig,
) {
  expect(Reflect.getMetadata(defaultLimitKey, method)).toBe(expected.limit);
  expect(Reflect.getMetadata(defaultTtlKey, method)).toBe(expected.ttl);
}

describe('rate limit decorators', () => {
  it('limits repeated login attempts', () => {
    expectDefaultThrottle(AuthController.prototype.login, RATE_LIMITS.login);
  });

  it('limits logout token revocation attempts', () => {
    expectDefaultThrottle(
      AuthController.prototype.logout,
      RATE_LIMITS.destructive,
    );
  });

  it('limits statement import uploads', () => {
    expectDefaultThrottle(
      StatementImportsController.prototype.preview,
      RATE_LIMITS.upload,
    );
    expectDefaultThrottle(
      StatementImportsController.prototype.createBatch,
      RATE_LIMITS.upload,
    );
  });

  it('limits destructive statement import actions', () => {
    expectDefaultThrottle(
      StatementImportsController.prototype.removeBatch,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      StatementImportsController.prototype.applyReadyMovements,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      StatementImportsController.prototype.undoAppliedMovements,
      RATE_LIMITS.destructive,
    );
  });

  it('limits destructive account and finance actions', () => {
    expectDefaultThrottle(
      UsersController.prototype.clearMyData,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      UsersController.prototype.deleteMyAccount,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      TransactionsController.prototype.removeBulk,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      TransactionsController.prototype.remove,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      CategoriesController.prototype.remove,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      FinancialAccountsController.prototype.remove,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      TransfersController.prototype.remove,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      RemindersController.prototype.remove,
      RATE_LIMITS.destructive,
    );
    expectDefaultThrottle(
      BalanceAdjustmentsController.prototype.remove,
      RATE_LIMITS.destructive,
    );
  });
});
