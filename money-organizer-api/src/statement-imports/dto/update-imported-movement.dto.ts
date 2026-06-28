import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ImportedMovementReconciliationStatus,
  ImportedMovementReviewTarget,
  StatementMovementDirection,
} from '../../../generated/prisma/client';

export class UpdateImportedMovementDto {
  @ApiProperty({
    description: 'Movement date',
    example: '2026-06-15',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    description: 'Absolute movement amount in cents',
    example: 12990,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiProperty({
    description: 'Balance direction for the imported movement',
    enum: StatementMovementDirection,
    required: false,
  })
  @IsOptional()
  @IsEnum(StatementMovementDirection)
  direction?: StatementMovementDirection;

  @ApiProperty({
    description: 'Editable movement type label',
    example: 'PIX',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  rawType?: string;

  @ApiProperty({
    description: 'Reviewed movement target',
    enum: ImportedMovementReviewTarget,
    required: false,
  })
  @IsOptional()
  @IsEnum(ImportedMovementReviewTarget)
  reviewTarget?: ImportedMovementReviewTarget;

  @ApiProperty({
    description: 'Other financial account when the imported movement is a transfer',
    example: 'd1f9b9ec-7b7c-43c2-8e7e-f51f5d7b2f6a',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reviewTransferAccountId?: string | null;

  @ApiProperty({
    description: 'Reviewed category when the imported movement will become a transaction',
    example: 'a34f4f71-d98e-4e7b-9d7e-b28f8e4d7771',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reviewCategoryId?: string | null;

  @ApiProperty({
    description: 'Manual reconciliation decision for possible ledger matches',
    enum: ImportedMovementReconciliationStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ImportedMovementReconciliationStatus)
  reconciliationStatus?: ImportedMovementReconciliationStatus;

  @ApiProperty({
    description: 'Optional note explaining the reconciliation decision',
    example: 'Não é duplicidade; compra recorrente no mesmo dia.',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reconciliationNote?: string | null;

  @ApiProperty({
    description: 'Editable movement description',
    example: 'Pix recebido de cliente',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rawDescription?: string;
}
