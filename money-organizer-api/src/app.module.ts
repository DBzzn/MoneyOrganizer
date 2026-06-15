import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { FinancialAccountsModule } from './financial-accounts/financial-accounts.module';
import { TransfersModule } from './transfers/transfers.module';
import { BalanceAdjustmentsModule } from './balance-adjustments/balance-adjustments.module';
import { RemindersModule } from './reminders/reminders.module';
import { StatementImportsModule } from './statement-imports/statement-imports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
        isGlobal: true
    }),
    UsersModule,
    PrismaModule,
    AuthModule,
    CategoriesModule,
    FinancialAccountsModule,
    TransactionsModule,
    TransfersModule,
    BalanceAdjustmentsModule,
    RemindersModule,
    StatementImportsModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
