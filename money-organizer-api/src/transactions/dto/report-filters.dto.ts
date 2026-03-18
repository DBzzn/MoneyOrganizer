import {
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';

export class ReportFiltersDto {
    // Formato da data adotado: 'YYYY-MM'
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}(-\d{2})?$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2026-03)'
    })
    month?: string; 

    @IsOptional()
    @IsString()
    @Matches(/^\d{4}(-\d{2})?$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2052-06)'
    })
    startMonth?: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{4}(-\d{2})?$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2013-12)'
    })
    endMonth ?: string;
}