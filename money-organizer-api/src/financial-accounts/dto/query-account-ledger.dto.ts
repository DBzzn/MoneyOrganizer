import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class QueryAccountLedgerDto {
  @ApiProperty({
    description: 'Data inicial do periodo',
    example: '2026-06-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Data final do periodo',
    example: '2026-06-30',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
