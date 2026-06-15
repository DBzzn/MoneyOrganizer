import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NubankPdfParser } from './parsers/nubank-pdf.parser';
import { StatementImportsController } from './statement-imports.controller';
import { StatementImportsService } from './statement-imports.service';

@Module({
  imports: [PrismaModule],
  controllers: [StatementImportsController],
  providers: [StatementImportsService, NubankPdfParser],
})
export class StatementImportsModule {}
