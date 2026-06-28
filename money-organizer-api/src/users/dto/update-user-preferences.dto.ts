import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({
    description: 'Meta de reserva em meses',
    example: 6,
    minimum: 1,
    maximum: 36,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  reserveTargetMonths?: number;
}
