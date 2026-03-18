import { min } from 'rxjs';
import { TransactionType } from '../../../generated/prisma/client'; 
import {
    IsDateString,
    IsBoolean,
    IsInt,
    Min,
    ValidateIf,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    isNotEmpty
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionDto {
    @ApiProperty({
        description: 'Tipo da transação',
        enum: TransactionType,
        example: TransactionType.DEBIT,
    })
    @IsEnum(TransactionType)
    @IsNotEmpty()
    type: TransactionType;

    @ApiProperty({
        description: 'Valor da transação (máximo 2 casas decimais)',
        example: 150.50,
        minimum: 0.01,
    })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    @IsNotEmpty()
    amount: number;

    @ApiProperty({
        description: 'Data da transação (formato ISO)',
        example: '2024-03-18',
    })
    @IsDateString()
    @IsNotEmpty()
    date: string;

    @ApiProperty({
        description: 'Indica se a transação está pendente',
        example: false,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    IsPending?: boolean;

    @ApiProperty({
        description: 'Descrição da transação',
        example: 'Compra no supermercado',
        required: false,
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'ID da categoria',
        example: 'uuid-da-categoria-aqui',
    })
    @IsString()
    @IsOptional()
    categoryId: string;

    //Quando há Parcelas:
    @ApiProperty({
        description: 'Total de parcelas (obrigatório apenas se type = CREDIT_INSTALLMENT)',
        example: 12,
        minimum: 2,
        required: false,
    })
    @ValidateIf((o) => o.type === TransactionType.CREDIT_INSTALLMENT)
    @IsInt()
    @Min(2)
    @IsNotEmpty()
    totalInstallments?: number;

    @ApiProperty({
        description: 'Número da parcela atual (obrigatório apenas se type = CREDIT_INSTALLMENT)',
        example: 1,
        minimum: 1,
        required: false,
    })
    @ValidateIf((o) => o.type === TransactionType.CREDIT_INSTALLMENT)
    @IsInt()
    @Min(1)
    @IsNotEmpty()
    currentInstallment?: number;

    @ApiProperty({
        description: 'ID do grupo de parcelamento (gerado automaticamente se não informado)',
        example: 'uuid-do-grupo',
        required: false,
    })
    @IsString()
    @IsOptional()
    installmentGroupId?: string;

}