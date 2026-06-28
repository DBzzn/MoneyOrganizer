import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { BalanceAdjustmentsService } from './balance-adjustments.service';
import { CreateBalanceAdjustmentDto } from './dto/create-balance-adjustment.dto';
import { QueryBalanceAdjustmentsDto } from './dto/query-balance-adjustments.dto';
import { UpdateBalanceAdjustmentDto } from './dto/update-balance-adjustment.dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('balance-adjustments')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('balance-adjustments')
export class BalanceAdjustmentsController {
  constructor(
    private readonly balanceAdjustmentsService: BalanceAdjustmentsService,
  ) {}

  @ApiOperation({ summary: 'Criar ajuste de saldo' })
  @ApiResponse({ status: 201, description: 'Ajuste de saldo criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createBalanceAdjustmentDto: CreateBalanceAdjustmentDto,
  ) {
    return this.balanceAdjustmentsService.create(
      req.user.id,
      createBalanceAdjustmentDto,
    );
  }

  @ApiOperation({ summary: 'Listar ajustes de saldo' })
  @ApiResponse({ status: 200, description: 'Lista de ajustes retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Get()
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: QueryBalanceAdjustmentsDto,
  ) {
    return this.balanceAdjustmentsService.findAll(req.user.id, filters);
  }

  @ApiOperation({ summary: 'Atualizar ajuste de saldo' })
  @ApiResponse({ status: 200, description: 'Ajuste atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Ajuste não encontrado' })
  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateBalanceAdjustmentDto: UpdateBalanceAdjustmentDto,
  ) {
    return this.balanceAdjustmentsService.update(
      req.user.id,
      id,
      updateBalanceAdjustmentDto,
    );
  }

  @ApiOperation({ summary: 'Remover ajuste de saldo' })
  @ApiResponse({ status: 200, description: 'Ajuste removido com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Ajuste não encontrado' })
  @Delete(':id')
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.balanceAdjustmentsService.remove(req.user.id, id);
  }
}
