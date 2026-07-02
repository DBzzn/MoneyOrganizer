import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RATE_LIMITS } from '../rate-limit.constants';
import { AuthenticatedUser } from './auth.types';
import { Request as ExpressRequest } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
  user: AuthenticatedUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Fazer login e obter token JWT' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso, retorna access_token' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  @Throttle({ default: RATE_LIMITS.login })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obter dados do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Retorna dados do usuário logado' })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@Request() req: AuthenticatedRequest) {    
    return this.authService.findById(req.user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revogar o token JWT atual' })
  @ApiResponse({ status: 200, description: 'Logout realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: RATE_LIMITS.destructive })
  @Post('logout')
  logout(@Request() req: AuthenticatedRequest) {
    return this.authService.logout(req.user);
  }
}
