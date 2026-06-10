import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTransferDto {
  @ApiProperty({
    description: 'Valor transferido entre contas',
    example: 150.5,
    minimum: 0.01,
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @ApiProperty({
    description: 'Data da transferência',
    example: '2026-06-09',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    description: 'Indica se a transferência ainda está pendente',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isPending?: boolean;

  @ApiProperty({
    description: 'Descrição opcional da transferência',
    example: 'Reserva para carteira',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'ID da conta de origem',
    example: 'uuid-conta-origem',
    required: false,
  })
  @IsString()
  @IsOptional()
  fromAccountId?: string;

  @ApiProperty({
    description: 'ID da conta de destino',
    example: 'uuid-conta-destino',
    required: false,
  })
  @IsString()
  @IsOptional()
  toAccountId?: string;
}
