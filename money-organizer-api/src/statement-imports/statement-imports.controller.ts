import {
  Body,
  Controller,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { StatementImportsService } from './statement-imports.service';
import { UploadedStatementFile } from './types';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('statement-imports')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('statement-imports')
export class StatementImportsController {
  constructor(private readonly statementImportsService: StatementImportsService) {}

  @ApiOperation({ summary: 'Gerar preview de importacao de extrato' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        financialAccountId: {
          type: 'string',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Preview gerado com sucesso' })
  @ApiResponse({ status: 400, description: 'Arquivo invalido' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @Post('preview')
  preview(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() file: UploadedStatementFile | undefined,
    @Body('financialAccountId') financialAccountId?: string,
  ) {
    return this.statementImportsService.preview(
      req.user.id,
      file,
      financialAccountId || undefined,
    );
  }
}
