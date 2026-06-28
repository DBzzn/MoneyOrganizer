import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStatementImportBatchDto {
  @ApiPropertyOptional({
    description: 'Nome/apelido do lote de importação',
    example: 'Nubank maio 2026',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string | null;
}
