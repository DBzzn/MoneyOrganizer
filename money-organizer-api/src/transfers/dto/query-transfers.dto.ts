import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QueryTransfersDto {
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

  @ApiProperty({
    description: 'Filtrar por conta envolvida na transferência',
    example: 'uuid-conta',
    required: false,
  })
  @IsOptional()
  @IsString()
  financialAccountId?: string;

  @ApiProperty({
    description: 'Filtrar por status pendente',
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPending?: boolean;
}
