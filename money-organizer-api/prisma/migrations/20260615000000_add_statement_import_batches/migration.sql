-- Persist statement import review batches without applying financial movements.
CREATE TYPE "StatementProvider" AS ENUM ('NUBANK', 'INTER', 'ITAU', 'SANTANDER', 'BRADESCO', 'CAIXA', 'BB', 'C6', 'MERCADO_PAGO', 'UNKNOWN');

CREATE TYPE "StatementSourceType" AS ENUM ('PDF', 'CSV', 'XLSX', 'OFX');

CREATE TYPE "StatementImportBatchStatus" AS ENUM ('DRAFT', 'REVIEWING', 'READY', 'APPLIED', 'PARTIALLY_APPLIED', 'CANCELED');

CREATE TYPE "StatementImportFileStatus" AS ENUM ('PARSED', 'DUPLICATE', 'FAILED');

CREATE TYPE "StatementMovementDirection" AS ENUM ('IN', 'OUT');

CREATE TYPE "ImportedMovementStatus" AS ENUM ('NEW', 'DUPLICATE', 'IGNORED', 'READY', 'NEEDS_REVIEW', 'APPLIED');

CREATE TABLE "StatementImportBatch" (
    "id" TEXT NOT NULL,
    "status" "StatementImportBatchStatus" NOT NULL DEFAULT 'REVIEWING',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatementImportFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "provider" "StatementProvider" NOT NULL,
    "sourceType" "StatementSourceType" NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "StatementImportFileStatus" NOT NULL DEFAULT 'PARSED',
    "duplicateOfFileId" TEXT,
    "accountNumber" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "openingBalanceCents" INTEGER,
    "closingBalanceCents" INTEGER,
    "totalInCents" INTEGER,
    "totalOutCents" INTEGER,
    "warnings" JSONB,
    "batchId" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementImportFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportedMovement" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "direction" "StatementMovementDirection" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "rawType" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "sourcePage" INTEGER,
    "sourceLine" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "ImportedMovementStatus" NOT NULL DEFAULT 'NEW',
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StatementImportBatch_userId_status_idx" ON "StatementImportBatch"("userId", "status");
CREATE INDEX "StatementImportBatch_userId_createdAt_idx" ON "StatementImportBatch"("userId", "createdAt");

CREATE INDEX "StatementImportFile_batchId_idx" ON "StatementImportFile"("batchId");
CREATE INDEX "StatementImportFile_financialAccountId_idx" ON "StatementImportFile"("financialAccountId");
CREATE INDEX "StatementImportFile_duplicateOfFileId_idx" ON "StatementImportFile"("duplicateOfFileId");
CREATE INDEX "StatementImportFile_userId_fileHash_idx" ON "StatementImportFile"("userId", "fileHash");
CREATE INDEX "StatementImportFile_dedupe_period_idx" ON "StatementImportFile"("userId", "provider", "sourceType", "accountNumber", "periodStart", "periodEnd");

CREATE INDEX "ImportedMovement_fileId_idx" ON "ImportedMovement"("fileId");
CREATE INDEX "ImportedMovement_userId_fingerprint_idx" ON "ImportedMovement"("userId", "fingerprint");
CREATE INDEX "ImportedMovement_userId_externalId_idx" ON "ImportedMovement"("userId", "externalId");
CREATE INDEX "ImportedMovement_userId_status_idx" ON "ImportedMovement"("userId", "status");
CREATE INDEX "ImportedMovement_date_idx" ON "ImportedMovement"("date");

ALTER TABLE "StatementImportBatch" ADD CONSTRAINT "StatementImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StatementImportFile" ADD CONSTRAINT "StatementImportFile_duplicateOfFileId_fkey" FOREIGN KEY ("duplicateOfFileId") REFERENCES "StatementImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StatementImportFile" ADD CONSTRAINT "StatementImportFile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StatementImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatementImportFile" ADD CONSTRAINT "StatementImportFile_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StatementImportFile" ADD CONSTRAINT "StatementImportFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportedMovement" ADD CONSTRAINT "ImportedMovement_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StatementImportFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportedMovement" ADD CONSTRAINT "ImportedMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
