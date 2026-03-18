import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
    user: { id: string, email: string };
}

@ApiTags('categories')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @ApiOperation({ summary: 'Criar nova categoria' })
    @ApiResponse({ status: 201, description: 'Categoria criada com sucesso' })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Post()
    create(
        @Request() req: AuthenticatedRequest,
        @Body() createCategoryDto: CreateCategoryDto
    ) {
        return this.categoriesService.create(req.user.id, createCategoryDto);
    }


    @ApiOperation({ summary: 'Listar todas as categorias do usuário' })
    @ApiResponse({ status: 200, description: 'Lista de categorias retornada com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @Get()
    findAll(@Request() req: AuthenticatedRequest) {
        return this.categoriesService.findAll(req.user.id);
    }


    @ApiOperation({ summary: 'Atualizar categoria existente' })
    @ApiResponse({ status: 200, description: 'Categoria atualizada com sucesso' })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Categoria não encontrada ou não pertence ao usuário' })
    @Patch(':id')
    update(
        @Request() req: AuthenticatedRequest,
        @Param('id') categoryId: string,
        @Body() dto: UpdateCategoryDto
    ) {
        return this.categoriesService.update(req.user.id, categoryId, dto);
    }


    @ApiOperation({ summary: 'Remover categoria' })
    @ApiResponse({ status: 200, description: 'Categoria removida com sucesso' })
    @ApiResponse({ status: 401, description: 'Não autenticado' })
    @ApiResponse({ status: 404, description: 'Categoria não encontrada ou não pertence ao usuário' })
    @Delete(':id')
    remove(
        @Request() req: AuthenticatedRequest,
        @Param('id') categoryId: string
    ) {
        return this.categoriesService.remove(req.user.id, categoryId);
    }
}
