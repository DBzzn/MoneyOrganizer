import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export function configureSecurityHeaders(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: { action: 'deny' },
    }),
  );
}
