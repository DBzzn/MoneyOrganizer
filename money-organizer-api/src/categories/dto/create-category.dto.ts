import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
    @ApiProperty({
        description: 'Nome da categoria',
        example: 'Educação',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Ícone da categoria (emoji)',
        example: '📚',
        required: false,
    })
    @IsString()
    @IsOptional()
    icon?: string;
}