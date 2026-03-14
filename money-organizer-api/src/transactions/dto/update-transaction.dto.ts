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


export class UpdateTransactionDto {

    @IsEnum(TransactionType)
    @IsOptional()
    type?: TransactionType

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    @IsOptional()
    amount?: number;

    @IsDateString()
    @IsOptional()
    date?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    categoryId?: string;
}