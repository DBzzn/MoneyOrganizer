import { TransactionType } from '../../../generated/prisma/client';
import {
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsBoolean,
    Min,
    isEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';


export class UpdateTransactionDto {
    @ApiProperty({
        description: 'Tipo da transação',
        enum: TransactionType,
        example: TransactionType.PIX,
        required: false,
    })
    @IsEnum(TransactionType)
    @IsOptional()
    type?: TransactionType

    @ApiProperty({
        description: 'Valor da transação (máximo 2 casas decimais)',
        example: 200.00,
        minimum: 0.01,
        required: false,
    })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    @IsOptional()
    amount?: number;

    @ApiProperty({
        description: 'Data da transação (formato ISO)',
        example: '2024-03-20',
        required: false,
    })
    @IsDateString()
    @IsOptional()
    date?: string;    

    @ApiProperty({
        description: 'Indica se a transação está pendente',
        example: true,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    isPending?: boolean;

    @ApiProperty({
        description: 'Descrição da transação',
        example: 'Pagamento atualizado',
        required: false,
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'ID da categoria',
        example: 'novo-uuid-da-categoria',
        required: false,
    })
    @IsString()
    @IsOptional()
    categoryId?: string;
}