import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryBalanceAdjustmentsDto {
  @ApiProperty({
    description: 'Filter by financial account ID',
    example: 'uuid-conta',
    required: false,
  })
  @IsOptional()
  @IsString()
  financialAccountId?: string;

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
}
