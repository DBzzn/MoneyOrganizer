-- Link applied imported movements to the financial entity created from review.
ALTER TABLE "ImportedMovement"
ADD COLUMN "appliedTransactionId" TEXT,
ADD COLUMN "appliedTransferId" TEXT;

CREATE INDEX "ImportedMovement_appliedTransactionId_idx" ON "ImportedMovement"("appliedTransactionId");
CREATE INDEX "ImportedMovement_appliedTransferId_idx" ON "ImportedMovement"("appliedTransferId");

ALTER TABLE "ImportedMovement"
ADD CONSTRAINT "ImportedMovement_appliedTransactionId_fkey"
FOREIGN KEY ("appliedTransactionId")
REFERENCES "Transaction"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "ImportedMovement"
ADD CONSTRAINT "ImportedMovement_appliedTransferId_fkey"
FOREIGN KEY ("appliedTransferId")
REFERENCES "Transfer"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
