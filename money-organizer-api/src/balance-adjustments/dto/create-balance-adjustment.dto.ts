import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBalanceAdjustmentDto {
  @ApiProperty({
    description: 'Signed adjustment amount. Positive increases balance, negative decreases it.',
    example: -42.35,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @NotEquals(0)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'Adjustment date',
    example: '2026-06-10',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({
    description: 'Required reason for the balance adjustment',
    example: 'Conciliacao com saldo real do banco',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  reason: string;

  @ApiProperty({
    description: 'Financial account ID',
    example: 'uuid-conta',
  })
  @IsString()
  @IsNotEmpty()
  financialAccountId: string;
}
