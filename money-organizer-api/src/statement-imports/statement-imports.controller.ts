import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
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
import { UpdateImportedMovementDto } from './dto/update-imported-movement.dto';
import { UpdateImportedMovementStatusDto } from './dto/update-imported-movement-status.dto';
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
  constructor(
    private readonly statementImportsService: StatementImportsService,
  ) {}

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
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
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

  @ApiOperation({ summary: 'Criar lote persistido de importacao de extratos' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        financialAccountId: {
          type: 'string',
        },
      },
      required: ['files'],
    },
  })
  @ApiResponse({ status: 201, description: 'Lote criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Arquivo invalido' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @UseInterceptors(
    FilesInterceptor('files', 10, { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @Post('batches')
  createBatch(
    @Request() req: AuthenticatedRequest,
    @UploadedFiles() files: UploadedStatementFile[] | undefined,
    @Body('financialAccountId') financialAccountId?: string,
  ) {
    return this.statementImportsService.createBatch(
      req.user.id,
      files,
      financialAccountId || undefined,
    );
  }

  @ApiOperation({ summary: 'Listar lotes recentes de importacao' })
  @ApiResponse({
    status: 200,
    description: 'Lista de lotes retornada com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @Get('batches')
  findBatches(@Request() req: AuthenticatedRequest) {
    return this.statementImportsService.findBatches(req.user.id);
  }

  @ApiOperation({ summary: 'Buscar lote de importacao por ID' })
  @ApiResponse({ status: 200, description: 'Lote retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @ApiResponse({ status: 404, description: 'Lote nao encontrado' })
  @Get('batches/:id')
  findBatch(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.statementImportsService.findBatch(req.user.id, id);
  }

  @ApiOperation({
    summary: 'Aplicar movimentos prontos de um lote revisado',
  })
  @ApiResponse({ status: 201, description: 'Movimentos prontos aplicados' })
  @ApiResponse({ status: 400, description: 'Lote sem movimentos prontos validos' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @ApiResponse({ status: 404, description: 'Lote nao encontrado' })
  @Post('batches/:id/apply-ready')
  applyReadyMovements(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.statementImportsService.applyReadyMovements(req.user.id, id);
  }

  @ApiOperation({ summary: 'Editar dados de movimento importado em revisao' })
  @ApiResponse({ status: 200, description: 'Movimento atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados invalidos para revisao' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @ApiResponse({ status: 404, description: 'Movimento nao encontrado' })
  @Patch('movements/:movementId')
  updateMovement(
    @Request() req: AuthenticatedRequest,
    @Param('movementId') movementId: string,
    @Body() dto: UpdateImportedMovementDto,
  ) {
    return this.statementImportsService.updateMovement(
      req.user.id,
      movementId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Atualizar status de revisao de movimento importado',
  })
  @ApiResponse({ status: 200, description: 'Movimento atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Status invalido para revisao' })
  @ApiResponse({ status: 401, description: 'Nao autenticado' })
  @ApiResponse({ status: 404, description: 'Movimento nao encontrado' })
  @Patch('movements/:movementId/status')
  updateMovementStatus(
    @Request() req: AuthenticatedRequest,
    @Param('movementId') movementId: string,
    @Body() dto: UpdateImportedMovementStatusDto,
  ) {
    return this.statementImportsService.updateMovementStatus(
      req.user.id,
      movementId,
      dto.status,
    );
  }
}
