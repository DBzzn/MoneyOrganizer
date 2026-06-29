import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReminderStatus } from '../../../generated/prisma/client';

export class UpdateReminderDto {
  @ApiProperty({
    description: 'Reminder title',
    example: 'Pagar fatura do cartão',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({
    description: 'Due date',
    example: '2026-06-20',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({
    description: 'Optional expected amount',
    example: 120.5,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number | null;

  @ApiProperty({
    description: 'Reminder status',
    enum: ReminderStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;

  @ApiProperty({
    description: 'Optional note',
    example: 'Conferir valor antes de pagar',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiProperty({
    description: 'Optional financial account ID',
    example: 'uuid-conta',
    required: false,
  })
  @IsOptional()
  @IsString()
  financialAccountId?: string | null;

  @ApiProperty({
    description: 'Optional category ID',
    example: 'uuid-categoria',
    required: false,
  })
  @IsOptional()
  @IsString()
  categoryId?: string | null;
}
