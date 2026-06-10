import { Module } from '@nestjs/common';
import { BalanceAdjustmentsController } from './balance-adjustments.controller';
import { BalanceAdjustmentsService } from './balance-adjustments.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BalanceAdjustmentsController],
  providers: [BalanceAdjustmentsService],
})
export class BalanceAdjustmentsModule {}
