import {
    IsOptional,
    IsEnum,
    IsDateString,
    IsString,
    IsBoolean,
    IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TransactionType } from '../../../generated/prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class QueryTransactionsDto {
    @ApiProperty({
    description: 'Data inicial do período (formato ISO)',
    example: '2024-03-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Data final do período (formato ISO)',
    example: '2024-03-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filtrar por ID de categoria específica',
    example: 'uuid-da-categoria',
    required: false,
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    description: 'Filtrar por ID de conta financeira específica',
    example: 'uuid-da-conta-financeira',
    required: false,
  })
  @IsOptional()
  @IsString()
  financialAccountId?: string;

  @ApiProperty({
    description: 'Filtrar por múltiplas contas financeiras',
    example: 'uuid-conta-1,uuid-conta-2',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => String(item).split(',')).filter(Boolean);
    }

    if (typeof value === 'string') {
      return value.split(',').filter(Boolean);
    }

    return undefined;
  })
  @IsString({ each: true })
  financialAccountIds?: string[];

  @ApiProperty({
    description: 'Filtrar por tipo de transação',
    enum: TransactionType,
    example: TransactionType.PIX,
    required: false,
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiProperty({
    description: 'Filtrar por status pendente',
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPending?: boolean;

  @ApiProperty({
    description: 'Buscar texto na descrição (case-insensitive)',
    example: 'mercado',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Valor mínimo da transação',
    example: 50,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @ApiProperty({
    description: 'Valor máximo da transação',
    example: 500,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;
}
