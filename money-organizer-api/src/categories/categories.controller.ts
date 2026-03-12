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

interface AuthenticatedRequest extends Request {
    user: { id: string, email: string };
}

@UseGuards(AuthGuard('jwt'))
@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Post()
    create(
        @Request() req: AuthenticatedRequest,
        @Body() createCategoryDto: CreateCategoryDto
    ) {
        return this.categoriesService.create(req.user.id, createCategoryDto);
    }

    @Get()
    findAll(@Request() req: AuthenticatedRequest) {
        return this.categoriesService.findAll(req.user.id);
    }

    @Patch(':id')
    update(
        @Request() req: AuthenticatedRequest,
        @Param('id') categoryId: string,
        @Body() dto: UpdateCategoryDto
    ) {
        return this.categoriesService.update(req.user.id, categoryId, dto);
    }

    @Delete(':id')
    remove(
        @Request() req: AuthenticatedRequest,
        @Param('id') categoryId: string
    ) {
        return this.categoriesService.remove(req.user.id, categoryId);
    }
}
