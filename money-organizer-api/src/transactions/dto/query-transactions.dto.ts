import {
    IsOptional,
    IsEnum,
    IsDateString,
    IsString,
    IsBoolean,
    IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TransactionType } from '../../../generated/prisma/client';

export class QueryTransactionsDto {
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsEnum(TransactionType)
    type?: TransactionType;

    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    isPending?: boolean;

    @IsOptional()
    @IsString()
    search?: string;    // Para buscar por descrição

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    minAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    maxAmount?: number;
}