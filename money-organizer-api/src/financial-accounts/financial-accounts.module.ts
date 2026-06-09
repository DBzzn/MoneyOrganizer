import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialAccountsController } from './financial-accounts.controller';
import { FinancialAccountsService } from './financial-accounts.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialAccountsController],
  providers: [FinancialAccountsService],
  exports: [FinancialAccountsService],
})
export class FinancialAccountsModule {}
