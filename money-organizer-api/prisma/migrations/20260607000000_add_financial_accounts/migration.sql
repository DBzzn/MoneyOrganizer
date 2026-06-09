-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('BANK_ACCOUNT', 'CASH_WALLET', 'OTHER');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL DEFAULT 'BANK_ACCOUNT',
    "institutionName" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "initialBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "includeInDashboard" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- Create one neutral default account for existing users.
INSERT INTO "FinancialAccount" (
    "id",
    "name",
    "type",
    "initialBalance",
    "includeInDashboard",
    "isArchived",
    "userId",
    "createdAt",
    "updatedAt"
)
SELECT
    'initial-account-' || "User"."id",
    'Conta inicial',
    'BANK_ACCOUNT',
    0,
    true,
    false,
    "User"."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE NOT EXISTS (
    SELECT 1
    FROM "FinancialAccount"
    WHERE "FinancialAccount"."userId" = "User"."id"
      AND "FinancialAccount"."name" = 'Conta inicial'
);

-- Add the relation as nullable first so existing rows can be backfilled safely.
ALTER TABLE "Transaction" ADD COLUMN "financialAccountId" TEXT;

UPDATE "Transaction"
SET "financialAccountId" = 'initial-account-' || "userId"
WHERE "financialAccountId" IS NULL;

ALTER TABLE "Transaction" ALTER COLUMN "financialAccountId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_idx" ON "FinancialAccount"("userId");
CREATE INDEX "FinancialAccount_userId_isArchived_idx" ON "FinancialAccount"("userId", "isArchived");
CREATE INDEX "Transaction_financialAccountId_idx" ON "Transaction"("financialAccountId");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
