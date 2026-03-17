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

export class CreateInstallmentsDto {
    @ValidateIf((o) => !o.installmentAmount)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    totalAmount?: number;

    @ValidateIf((o) => !o.totalAmount)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    installmentAmount?: number;

    @IsInt()
    @Min(2)
    @IsNotEmpty()
    totalInstallments: number;

    @IsDateString()
    @IsNotEmpty()
    firstInstallmentDate: string;

    @IsString()
    @IsNotEmpty()
    categoryId: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsOptional()
    isPending?: boolean;
}