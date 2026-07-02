import {
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { ConfirmUserPasswordDto } from './dto/confirm-user-password.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { RATE_LIMITS } from '../rate-limit.constants';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Não foi possível concluir a solicitação' })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Atualizar nome ou email do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Senha atual inválida ou token inválido' })
  @ApiResponse({ status: 409, description: 'Não foi possível concluir a solicitação' })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Alterar senha do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Senha atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Senha atual inválida ou token inválido' })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/password')
  updatePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateUserPasswordDto,
  ) {
    return this.usersService.updatePassword(req.user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Atualizar preferências financeiras do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Preferências atualizadas com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/preferences')
  updatePreferences(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.usersService.updatePreferences(req.user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Limpar todos os dados financeiros mantendo o usuário' })
  @ApiResponse({ status: 200, description: 'Dados limpos com sucesso' })
  @ApiResponse({ status: 401, description: 'Senha atual inválida ou token inválido' })
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: RATE_LIMITS.destructive })
  @Post('me/clear-data')
  clearMyData(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConfirmUserPasswordDto,
  ) {
    return this.usersService.clearMyData(req.user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Excluir todos os dados e remover o usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Conta excluída com sucesso' })
  @ApiResponse({ status: 401, description: 'Senha atual inválida ou token inválido' })
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: RATE_LIMITS.destructive })
  @Delete('me')
  deleteMyAccount(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConfirmUserPasswordDto,
  ) {
    return this.usersService.deleteMyAccount(req.user.id, dto);
  }
}
