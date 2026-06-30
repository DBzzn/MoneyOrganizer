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
import { CreateReminderDto } from './dto/create-reminder.dto';
import { QueryRemindersDto } from './dto/query-reminders.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';
import { RATE_LIMITS } from '../rate-limit.constants';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('reminders')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @ApiOperation({ summary: 'Criar lembrete financeiro' })
  @ApiResponse({ status: 201, description: 'Lembrete criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createReminderDto: CreateReminderDto,
  ) {
    return this.remindersService.create(req.user.id, createReminderDto);
  }

  @ApiOperation({ summary: 'Listar lembretes financeiros' })
  @ApiResponse({ status: 200, description: 'Lista de lembretes retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @Get()
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: QueryRemindersDto,
  ) {
    return this.remindersService.findAll(req.user.id, filters);
  }

  @ApiOperation({ summary: 'Buscar lembrete por ID' })
  @ApiResponse({ status: 200, description: 'Lembrete retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lembrete não encontrado' })
  @Get(':id')
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.remindersService.findOne(req.user.id, id);
  }

  @ApiOperation({ summary: 'Atualizar lembrete financeiro' })
  @ApiResponse({ status: 200, description: 'Lembrete atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lembrete não encontrado' })
  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateReminderDto: UpdateReminderDto,
  ) {
    return this.remindersService.update(req.user.id, id, updateReminderDto);
  }

  @ApiOperation({ summary: 'Remover lembrete financeiro' })
  @ApiResponse({ status: 200, description: 'Lembrete removido com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Lembrete não encontrado' })
  @Throttle({ default: RATE_LIMITS.destructive })
  @Delete(':id')
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.remindersService.remove(req.user.id, id);
  }
}
