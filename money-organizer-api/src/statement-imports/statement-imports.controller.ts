import {
  Body,
  Controller,
  Delete,
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
import { Throttle } from '@nestjs/throttler';
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
import { UpdateStatementImportBatchDto } from './dto/update-statement-import-batch.dto';
import { UndoAppliedMovementsDto } from './dto/undo-applied-movements.dto';
import { BulkReviewCategoryDto } from './dto/bulk-review-category.dto';
import { StatementImportsService } from './statement-imports.service';
import { UploadedStatementFile } from './types';
import { RATE_LIMITS } from '../rate-limit.constants';

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

  @ApiOperation({ summary: 'Gerar preview de importação de extrato' })
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
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @Throttle({ default: RATE_LIMITS.upload })
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

  @ApiOperation({ summary: 'Criar lote persistido de importação de extratos' })
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
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @UseInterceptors(
    FilesInterceptor('files', 10, { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @Throttle({ default: RATE_LIMITS.upload })
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

  @ApiOperation({ summary: 'Listar lotes recentes de importação' })
  @ApiResponse({
    status: 200,
    description: 'Lista de lotes retornada com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Get('batches')
  findBatches(@Request() req: AuthenticatedRequest) {
    return this.statementImportsService.findBatches(req.user.id);
  }

  @ApiOperation({ summary: 'Buscar lote de importação por ID' })
  @ApiResponse({ status: 200, description: 'Lote retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lote não encontrado' })
  @Get('batches/:id')
  findBatch(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.statementImportsService.findBatch(req.user.id, id);
  }

  @ApiOperation({ summary: 'Atualizar nome/apelido de um lote de importação' })
  @ApiResponse({ status: 200, description: 'Lote atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lote não encontrado' })
  @Patch('batches/:id')
  updateBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateStatementImportBatchDto,
  ) {
    return this.statementImportsService.updateBatch(req.user.id, id, dto);
  }

  @ApiOperation({ summary: 'Excluir lote de importação ainda não aplicado' })
  @ApiResponse({ status: 200, description: 'Lote excluído com sucesso' })
  @ApiResponse({ status: 400, description: 'Lote aplicado não pode ser excluído' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lote não encontrado' })
  @Throttle({ default: RATE_LIMITS.destructive })
  @Delete('batches/:id')
  removeBatch(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.statementImportsService.removeBatch(req.user.id, id);
  }

  @ApiOperation({
    summary: 'Aplicar movimentos prontos de um lote revisado',
  })
  @ApiResponse({ status: 201, description: 'Movimentos prontos aplicados' })
  @ApiResponse({ status: 400, description: 'Lote sem movimentos prontos válidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lote não encontrado' })
  @Throttle({ default: RATE_LIMITS.destructive })
  @Post('batches/:id/apply-ready')
  applyReadyMovements(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.statementImportsService.applyReadyMovements(req.user.id, id);
  }

  @ApiOperation({
    summary: 'Desfazer movimentos aplicados de um lote de importação',
  })
  @ApiResponse({ status: 201, description: 'Movimentos aplicados desfeitos' })
  @ApiResponse({ status: 400, description: 'Lote sem movimentos aplicados' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lote não encontrado' })
  @Throttle({ default: RATE_LIMITS.destructive })
  @Post('batches/:id/undo-applied')
  undoAppliedMovements(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto?: UndoAppliedMovementsDto,
  ) {
    return this.statementImportsService.undoAppliedMovements(
      req.user.id,
      id,
      dto?.movementIds,
    );
  }

  @ApiOperation({
    summary: 'Aplicar categoria revisada a movimentos selecionados do lote',
  })
  @ApiResponse({ status: 200, description: 'Movimentos atualizados com sucesso' })
  @ApiResponse({ status: 400, description: 'Seleção inválida para categoria em massa' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lote ou movimento não encontrado' })
  @Patch('batches/:id/movements/review-category')
  bulkReviewCategory(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: BulkReviewCategoryDto,
  ) {
    return this.statementImportsService.bulkReviewCategory(
      req.user.id,
      id,
      dto,
    );
  }

  @ApiOperation({ summary: 'Editar dados de movimento importado em revisão' })
  @ApiResponse({ status: 200, description: 'Movimento atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos para revisão' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Movimento não encontrado' })
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
    summary: 'Atualizar status de revisão de movimento importado',
  })
  @ApiResponse({ status: 200, description: 'Movimento atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Status inválido para revisão' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Movimento não encontrado' })
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
