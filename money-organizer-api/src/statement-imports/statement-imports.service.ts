import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NubankPdfParser } from './parsers/nubank-pdf.parser';
import { UploadedStatementFile } from './types';

const FINANCIAL_ACCOUNT_SELECT = {
  id: true,
  name: true,
  type: true,
  institutionName: true,
  icon: true,
  color: true,
  isArchived: true,
};

function fileHash(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

@Injectable()
export class StatementImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nubankPdfParser: NubankPdfParser,
  ) {}

  async preview(
    userId: string,
    file: UploadedStatementFile | undefined,
    financialAccountId?: string,
  ) {
    if (!file?.buffer || file.size === 0) {
      throw new BadRequestException('Envie um arquivo de extrato para importar.');
    }

    if (!this.nubankPdfParser.canParse(file.originalname, file.mimetype)) {
      throw new BadRequestException('Por enquanto, envie um extrato Nubank em PDF.');
    }

    const targetAccount = financialAccountId
      ? await this.prisma.financialAccount.findFirst({
          where: {
            id: financialAccountId,
            userId,
            isArchived: false,
          },
          select: FINANCIAL_ACCOUNT_SELECT,
        })
      : null;

    if (financialAccountId && !targetAccount) {
      throw new BadRequestException('Conta financeira nao encontrada ou arquivada.');
    }

    const parsed = this.nubankPdfParser.parse(file.buffer);

    return {
      file: {
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        sha256: fileHash(file.buffer),
      },
      targetAccount,
      ...parsed,
    };
  }
}
