import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class BulkReviewCategoryDto {
  @ApiProperty({
    description: 'Imported movement IDs to update inside the selected batch.',
    example: ['d1f9b9ec-7b7c-43c2-8e7e-f51f5d7b2f6a'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  movementIds: string[];

  @ApiProperty({
    description: 'Reviewed category ID to apply to the selected movements.',
    example: 'a34f4f71-d98e-4e7b-9d7e-b28f8e4d7771',
  })
  @IsString()
  @MaxLength(80)
  reviewCategoryId: string;
}
