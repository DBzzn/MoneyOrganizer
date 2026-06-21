import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UndoAppliedMovementsDto {
  @ApiProperty({
    description:
      'Optional applied imported movement IDs to undo. When omitted, all applied movements in the batch are undone.',
    example: ['d1f9b9ec-7b7c-43c2-8e7e-f51f5d7b2f6a'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  movementIds?: string[];
}
