import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  DEFAULT_CORS_ORIGINS,
  createCorsOriginValidator,
  parseCsv,
} from './security/cors';
import { configureSecurityHeaders } from './security/security-headers';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    configureSecurityHeaders(app);

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
      origin: createCorsOriginValidator({
        configuredOrigins: allowedCorsOrigins,
        allowTailscaleOrigins,
      }),
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
      .addTag('transfers', 'Gerenciamento de transferências entre contas')
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
