import type { INestApplication } from '@nestjs/common';
import { configureSecurityHeaders } from './security-headers';

describe('security headers', () => {
  it('sets an anti-clickjacking frame policy', () => {
    const middlewares: Array<(req: unknown, res: unknown, next: () => void) => void> =
      [];
    const app = {
      use: jest.fn((middleware) => {
        middlewares.push(middleware);
      }),
    } as unknown as INestApplication;
    const response = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
    };

    configureSecurityHeaders(app);
    middlewares[0]({}, response, jest.fn());

    expect(response.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });
});
