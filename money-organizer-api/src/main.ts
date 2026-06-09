import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function parseCsv(value?: string): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isTailscaleIp(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);

  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 100 &&
    parts[1] >= 64 &&
    parts[1] <= 127
  );
}

function isAllowedTailscaleOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isDevFrontendPort = url.port === '5173' || url.port === '4173';
    const isHttpProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const hostname = url.hostname.toLowerCase();

    return (
      isHttpProtocol &&
      isDevFrontendPort &&
      (isTailscaleIp(hostname) || hostname.endsWith('.ts.net'))
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    app.use((req, res, next) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        next();
    })

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));

    const configuredCorsOrigins = parseCsv(process.env.CORS_ORIGINS);
    const allowedCorsOrigins = configuredCorsOrigins.length > 0
      ? configuredCorsOrigins
      : DEFAULT_CORS_ORIGINS;
    const allowTailscaleOrigins = process.env.ALLOW_TAILSCALE_ORIGINS !== 'false';

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        const isAllowedOrigin =
          allowedCorsOrigins.includes(origin) ||
          (allowTailscaleOrigins && isAllowedTailscaleOrigin(origin));

        callback(isAllowedOrigin ? null : new Error('Origin not allowed by CORS'), isAllowedOrigin);
      },
      credentials: true,
    })

  const config = new DocumentBuilder()
      .setTitle('MoneyOrganizerAPI')
      .setDescription('API para Gerenciamento Financeiro Pessoal')
      .setVersion('1.0')
      .addTag('users', 'Gerenciamento de Usuários')
      .addTag('auth', 'Autenticação e Autorização')
      .addTag('categories', 'Gerenciamento dos gastos por Categoria')
      .addTag('financial-accounts', 'Gerenciamento de contas financeiras')
      .addTag('transactions', 'Gerenciamento de todas as transações')
      .addBearerAuth(
          {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              name: 'JWT',
              description: 'insira o token JWT',
              in: 'header',
          },
          'JWT-auth'
      )
      .build();
  const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.APP_HOST ?? '0.0.0.0';

  await app.listen(port, host); //lembra de configurar o .env do front com a mesma porta!
}
bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar o app:', error);
  process.exit(1);
});
