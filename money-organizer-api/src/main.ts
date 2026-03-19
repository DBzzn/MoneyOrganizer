import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

    app.enableCors({
      origin: 'http://localhost:5173', //configurar de acordo com a porta do front!
      credentials: true,
    })

  const config = new DocumentBuilder()
      .setTitle('MoneyOrganizerAPI')
      .setDescription('API para Gerenciamento Financeiro Pessoal')
      .setVersion('1.0')
      .addTag('users', 'Gerenciamento de Usuários')
      .addTag('auth', 'Autenticação e Autorização')
      .addTag('categories', 'Gerenciamento dos gastos por Categoria')
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
  await app.listen(process.env.PORT ?? 3000); //lembra de configurar o .env do front com a mesma porta!
}
bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar o app:', error);
  process.exit(1);
});
