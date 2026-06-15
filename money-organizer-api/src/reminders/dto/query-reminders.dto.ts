import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReminderStatus } from '../../../generated/prisma/client';

export class QueryRemindersDto {
  @ApiProperty({
    description: 'Filter by reminder status',
    enum: ReminderStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;

  @ApiProperty({
    description: 'Start date',
    example: '2026-06-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date',
    example: '2026-06-30',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter by financial account ID',
    example: 'uuid-conta',
    required: false,
  })
  @IsOptional()
  @IsString()
  financialAccountId?: string;

  @ApiProperty({
    description: 'Filter by category ID',
    example: 'uuid-categoria',
    required: false,
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
