import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FinancialAccountType } from '../../../generated/prisma/client';

export class UpdateFinancialAccountDto {
  @ApiProperty({
    description: 'Nome da conta financeira',
    example: 'Nubank',
    required: false,
  })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Tipo da conta financeira',
    enum: FinancialAccountType,
    example: FinancialAccountType.BANK_ACCOUNT,
    required: false,
  })
  @IsEnum(FinancialAccountType)
  @IsOptional()
  type?: FinancialAccountType;

  @ApiProperty({
    description: 'Nome da instituição financeira, quando houver',
    example: 'Nubank',
    required: false,
  })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  institutionName?: string;

  @ApiProperty({
    description: 'Ícone visual da conta em uma chave lucide:* selecionada no app',
    example: 'lucide:landmark',
    required: false,
  })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  icon?: string;

  @ApiProperty({
    description: 'Cor da conta em hexadecimal',
    example: '#7c3aed',
    required: false,
  })
  @IsHexColor()
  @IsOptional()
  color?: string;

  @ApiProperty({
    description: 'Saldo inicial informado manualmente',
    example: 1000,
    minimum: 0,
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  initialBalance?: number;

  @ApiProperty({
    description: 'Indica se a conta entra nos resumos do dashboard',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  includeInDashboard?: boolean;

  @ApiProperty({
    description: 'Indica se a conta está arquivada',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}
