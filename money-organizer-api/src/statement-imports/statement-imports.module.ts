import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CsvStatementParser } from './parsers/csv-statement.parser';
import { NubankPdfParser } from './parsers/nubank-pdf.parser';
import { OfxParser } from './parsers/ofx.parser';
import { StatementImportsController } from './statement-imports.controller';
import { StatementImportsService } from './statement-imports.service';

@Module({
  imports: [PrismaModule],
  controllers: [StatementImportsController],
  providers: [StatementImportsService, OfxParser, CsvStatementParser, NubankPdfParser],
})
export class StatementImportsModule {}
