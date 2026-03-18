import {
    IsString,
    IsNotEmpty,
    IsDateString,
    IsOptional,
    IsInt,
    Min,
    IsNumber,
    ValidateIf
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInstallmentsDto {
    @ApiProperty({
    description: 'Valor total do parcelamento (informe este OU installmentAmount)',
    example: 1200,
    minimum: 0.01,
    required: false,
  })
  @ValidateIf((o) => !o.installmentAmount)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount?: number;

  @ApiProperty({
    description: 'Valor de cada parcela (informe este OU totalAmount)',
    example: 100,
    minimum: 0.01,
    required: false,
  })
  @ValidateIf((o) => !o.totalAmount)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  installmentAmount?: number;

  @ApiProperty({
    description: 'Número total de parcelas',
    example: 12,
    minimum: 2,
  })
  @IsInt()
  @Min(2)
  @IsNotEmpty()
  totalInstallments: number;

  @ApiProperty({
    description: 'Data da primeira parcela (formato ISO)',
    example: '2024-03-15',
  })
  @IsDateString()
  @IsNotEmpty()
  firstInstallmentDate: string;

  @ApiProperty({
    description: 'ID da categoria',
    example: 'uuid-da-categoria-aqui',
  })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({
    description: 'Descrição do parcelamento',
    example: 'Notebook Dell Inspiron',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Indica se as parcelas serão criadas como pendentes',
    example: false,
    required: false,
  })
  @IsOptional()
  isPending?: boolean;
}