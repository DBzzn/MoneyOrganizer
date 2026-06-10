import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({
    description: 'Nome da categoria',
    example: 'Educacao Online',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Icone da categoria, como emoji ou chave lucide:*',
    example: 'lucide:graduation-cap',
    required: false,
  })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  icon?: string;

  @ApiProperty({
    description: 'Indica se a categoria esta arquivada',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}
