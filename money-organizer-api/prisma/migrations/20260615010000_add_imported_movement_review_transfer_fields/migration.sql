-- Store review intent for imported movements before applying anything to the ledger.
CREATE TYPE "ImportedMovementReviewTarget" AS ENUM ('TRANSACTION', 'TRANSFER');

ALTER TABLE "ImportedMovement"
ADD COLUMN "reviewTarget" "ImportedMovementReviewTarget" NOT NULL DEFAULT 'TRANSACTION',
ADD COLUMN "reviewTransferAccountId" TEXT;

CREATE INDEX "ImportedMovement_reviewTransferAccountId_idx" ON "ImportedMovement"("reviewTransferAccountId");

ALTER TABLE "ImportedMovement"
ADD CONSTRAINT "ImportedMovement_reviewTransferAccountId_fkey"
FOREIGN KEY ("reviewTransferAccountId")
REFERENCES "FinancialAccount"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
