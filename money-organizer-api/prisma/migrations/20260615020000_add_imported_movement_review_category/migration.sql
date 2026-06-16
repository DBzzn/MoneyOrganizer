-- Store the reviewed category for imported movements before final application.
ALTER TABLE "ImportedMovement"
ADD COLUMN "reviewCategoryId" TEXT;

CREATE INDEX "ImportedMovement_reviewCategoryId_idx" ON "ImportedMovement"("reviewCategoryId");

ALTER TABLE "ImportedMovement"
ADD CONSTRAINT "ImportedMovement_reviewCategoryId_fkey"
FOREIGN KEY ("reviewCategoryId")
REFERENCES "Category"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
