import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class UpdateCategoryDto {
  @ApiProperty({
    description: 'Nome da categoria',
    example: 'Educação Online',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Ícone da categoria (emoji)',
    example: '🎓',
    required: false,
  })
  @IsString()
  @IsOptional()
  icon?: string;
}
