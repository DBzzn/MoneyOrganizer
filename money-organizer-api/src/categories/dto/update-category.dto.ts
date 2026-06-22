import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CategoryKind } from '../../../generated/prisma/client';

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
    description: 'Icone da categoria em uma chave lucide:* selecionada no app',
    example: 'lucide:graduation-cap',
    required: false,
  })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  icon?: string;

  @ApiProperty({
    description: 'Natureza financeira permitida para a categoria',
    enum: CategoryKind,
    example: CategoryKind.INCOME,
    required: false,
  })
  @IsEnum(CategoryKind)
  @IsOptional()
  kind?: CategoryKind;

  @ApiProperty({
    description: 'Indica se a categoria esta arquivada',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}
