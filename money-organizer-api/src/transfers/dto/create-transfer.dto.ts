import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransferDto {
  @ApiProperty({
    description: 'Valor transferido entre contas',
    example: 150.5,
    minimum: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'Data da transferência',
    example: '2026-06-09',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;

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
  })
  @IsString()
  @IsNotEmpty()
  fromAccountId: string;

  @ApiProperty({
    description: 'ID da conta de destino',
    example: 'uuid-conta-destino',
  })
  @IsString()
  @IsNotEmpty()
  toAccountId: string;
}
