import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CategoryKind } from '../../../generated/prisma/client';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Nome da categoria',
    example: 'Educação',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Ícone da categoria em uma chave lucide:* selecionada no app',
    example: 'lucide:book-open',
    required: false,
  })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  icon?: string;

  @ApiProperty({
    description: 'Natureza financeira permitida para a categoria',
    enum: CategoryKind,
    example: CategoryKind.EXPENSE,
    required: false,
  })
  @IsEnum(CategoryKind)
  @IsOptional()
  kind?: CategoryKind;
}
