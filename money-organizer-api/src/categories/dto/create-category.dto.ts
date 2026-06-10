import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Nome da categoria',
    example: 'Educacao',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Icone da categoria, como emoji ou chave lucide:*',
    example: 'lucide:book-open',
    required: false,
  })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  icon?: string;
}
