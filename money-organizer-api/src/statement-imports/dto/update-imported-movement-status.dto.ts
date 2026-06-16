import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ImportedMovementStatus } from '../../../generated/prisma/client';

export const REVIEWABLE_IMPORTED_MOVEMENT_STATUSES = [
  ImportedMovementStatus.NEW,
  ImportedMovementStatus.IGNORED,
  ImportedMovementStatus.READY,
] as const;

export type ReviewableImportedMovementStatus =
  (typeof REVIEWABLE_IMPORTED_MOVEMENT_STATUSES)[number];

export class UpdateImportedMovementStatusDto {
  @ApiProperty({
    description: 'Manual review status for an imported movement',
    enum: REVIEWABLE_IMPORTED_MOVEMENT_STATUSES,
    example: ImportedMovementStatus.READY,
  })
  @IsIn(REVIEWABLE_IMPORTED_MOVEMENT_STATUSES)
  status!: ReviewableImportedMovementStatus;
}
