-- Persist the user's reconciliation decision before imported movements can affect balances.
CREATE TYPE "ImportedMovementReconciliationStatus" AS ENUM ('PENDING', 'CONFIRMED_UNIQUE', 'CONFIRMED_DUPLICATE');

ALTER TABLE "ImportedMovement"
ADD COLUMN "reconciliationStatus" "ImportedMovementReconciliationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reconciliationNote" TEXT,
ADD COLUMN "reconciliationReviewedAt" TIMESTAMP(3),
ADD COLUMN "appliedAt" TIMESTAMP(3);

UPDATE "ImportedMovement"
SET
  "reconciliationStatus" = 'CONFIRMED_UNIQUE',
  "reconciliationReviewedAt" = "updatedAt",
  "appliedAt" = "updatedAt"
WHERE "status" = 'APPLIED';

CREATE INDEX "ImportedMovement_userId_reconciliationStatus_idx" ON "ImportedMovement"("userId", "reconciliationStatus");
