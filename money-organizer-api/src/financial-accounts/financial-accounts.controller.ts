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
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { FinancialAccountsService } from './financial-accounts.service';
import { CreateFinancialAccountDto } from './dto/create-financial-account.dto';
import { UpdateFinancialAccountDto } from './dto/update-financial-account.dto';
import { QueryAccountLedgerDto } from './dto/query-account-ledger.dto';
import { RATE_LIMITS } from '../rate-limit.constants';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('financial-accounts')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('financial-accounts')
export class FinancialAccountsController {
  constructor(
    private readonly financialAccountsService: FinancialAccountsService,
  ) {}

  @ApiOperation({ summary: 'Criar nova conta financeira' })
  @ApiResponse({ status: 201, description: 'Conta financeira criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateFinancialAccountDto,
  ) {
    return this.financialAccountsService.create(req.user.id, dto);
  }

  @ApiOperation({ summary: 'Listar contas financeiras do usuário' })
  @ApiResponse({ status: 200, description: 'Lista de contas financeiras retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    return this.financialAccountsService.findAll(req.user.id);
  }

  @ApiOperation({ summary: 'Listar extrato unificado de uma conta financeira' })
  @ApiResponse({ status: 200, description: 'Extrato da conta retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Conta financeira não encontrada ou não pertence ao usuário' })
  @Get(':id/ledger')
  getLedger(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() filters: QueryAccountLedgerDto,
  ) {
    return this.financialAccountsService.getLedger(req.user.id, id, filters);
  }

  @ApiOperation({ summary: 'Buscar conta financeira específica por ID' })
  @ApiResponse({ status: 200, description: 'Conta financeira retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Conta financeira não encontrada ou não pertence ao usuário' })
  @Get(':id')
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.financialAccountsService.findOne(req.user.id, id);
  }

  @ApiOperation({ summary: 'Atualizar conta financeira existente' })
  @ApiResponse({ status: 200, description: 'Conta financeira atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Conta financeira não encontrada ou não pertence ao usuário' })
  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFinancialAccountDto,
  ) {
    return this.financialAccountsService.update(req.user.id, id, dto);
  }

  @ApiOperation({ summary: 'Arquivar conta financeira' })
  @ApiResponse({ status: 200, description: 'Conta financeira arquivada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Conta financeira não encontrada ou não pertence ao usuário' })
  @Throttle({ default: RATE_LIMITS.destructive })
  @Delete(':id')
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.financialAccountsService.remove(req.user.id, id);
  }
}
