import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Fazer login e obter token JWT' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso, retorna access_token' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
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
}
