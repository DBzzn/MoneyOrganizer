import {
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReportFiltersDto {
    @ApiProperty({
        description: 'Mês específico para o relatório (formato YYYY-MM)',
        example: '2024-03',
        required: false,
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}$/, {
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
    @Matches(/^\d{4}-\d{2}$/, {
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
    @Matches(/^\d{4}-\d{2}$/, {
        message: 'a data deve estar no formato YYYY-MM (ex: 2013-12)'
    })
    endMonth ?: string;

    @ApiProperty({
        description: 'Filtrar relatórios por múltiplas contas financeiras',
        example: 'uuid-conta-1,uuid-conta-2',
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => {
        if (Array.isArray(value)) {
            return value.flatMap((item) => String(item).split(',')).filter(Boolean);
        }

        if (typeof value === 'string') {
            return value.split(',').filter(Boolean);
        }

        return undefined;
    })
    @IsString({ each: true })
    financialAccountIds?: string[];
}
