import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBalanceAdjustmentDto {
  @ApiProperty({
    description: 'Signed adjustment amount. Positive increases balance, negative decreases it.',
    example: -42.35,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @NotEquals(0)
  amount?: number;

  @ApiProperty({
    description: 'Adjustment date',
    example: '2026-06-10',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    description: 'Required reason for the balance adjustment',
    example: 'Conciliação com saldo real do banco',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
