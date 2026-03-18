import {
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportFiltersDto {
    @ApiProperty({
        description: 'Mês específico para o relatório (formato YYYY-MM)',
        example: '2024-03',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}(-\d{2})?$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2026-03)'
    })
    month?: string; 

    @ApiProperty({
        description: 'Mês inicial para evolução temporal (formato YYYY-MM)',
        example: '2024-01',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}(-\d{2})?$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2052-06)'
    })
    startMonth?: string;

    @ApiProperty({
        description: 'Mês final para evolução temporal (formato YYYY-MM)',
        example: '2024-06',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}(-\d{2})?$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2013-12)'
    })
    endMonth ?: string;
}