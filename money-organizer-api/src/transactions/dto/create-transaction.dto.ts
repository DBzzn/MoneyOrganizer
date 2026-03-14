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

export class CreateTransactionDto {
    @IsEnum(TransactionType)
    @IsNotEmpty()
    type: TransactionType;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    @IsNotEmpty()
    amount: number;

    @IsDateString()
    @IsNotEmpty()
    date: string;

    @IsBoolean()
    @IsOptional()
    IsPending?: boolean;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    categoryId: string;

    //Quando há Parcelas:
    @ValidateIf((o) => o.type === TransactionType.CREDIT_INSTALLMENT)
    @IsInt()
    @Min(2)
    @IsNotEmpty()
    totalInstallments?: number;

    @ValidateIf((o) => o.type === TransactionType.CREDIT_INSTALLMENT)
    @IsInt()
    @Min(1)
    @IsNotEmpty()
    currentInstallment?: number;

    @IsString()
    @IsOptional()
    installmentGroupId?: string;

}