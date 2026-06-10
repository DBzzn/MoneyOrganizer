import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FinancialAccountType } from '../../../generated/prisma/client';

export class CreateFinancialAccountDto {
  @ApiProperty({
    description: 'Nome da conta financeira',
    example: 'Nubank',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

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
    description: 'Icone visual da conta, como emoji ou chave lucide:*',
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
}
