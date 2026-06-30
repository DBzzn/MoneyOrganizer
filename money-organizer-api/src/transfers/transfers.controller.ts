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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';
import { QueryTransfersDto } from './dto/query-transfers.dto';
import { RATE_LIMITS } from '../rate-limit.constants';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('transfers')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @ApiOperation({ summary: 'Criar transferência entre contas' })
  @ApiResponse({ status: 201, description: 'Transferência criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createTransferDto: CreateTransferDto,
  ) {
    return this.transfersService.create(req.user.id, createTransferDto);
  }

  @ApiOperation({ summary: 'Listar transferências com filtros opcionais' })
  @ApiResponse({ status: 200, description: 'Lista de transferências retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Get()
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: QueryTransfersDto,
  ) {
    return this.transfersService.findAll(req.user.id, filters);
  }

  @ApiOperation({ summary: 'Buscar transferência por ID' })
  @ApiResponse({ status: 200, description: 'Transferência retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Transferência não encontrada' })
  @Get(':id')
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.transfersService.findOne(req.user.id, id);
  }

  @ApiOperation({ summary: 'Atualizar transferência existente' })
  @ApiResponse({ status: 200, description: 'Transferência atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Transferência não encontrada' })
  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateTransferDto: UpdateTransferDto,
  ) {
    return this.transfersService.update(req.user.id, id, updateTransferDto);
  }

  @ApiOperation({ summary: 'Remover transferência' })
  @ApiResponse({ status: 200, description: 'Transferência removida com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Transferência não encontrada' })
  @Throttle({ default: RATE_LIMITS.destructive })
  @Delete(':id')
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.transfersService.remove(req.user.id, id);
  }
}
