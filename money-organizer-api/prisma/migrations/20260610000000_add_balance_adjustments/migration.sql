-- Balance adjustments preserve account reconciliation history without turning
-- corrections into income or expenses.
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BalanceAdjustment_userId_idx" ON "BalanceAdjustment"("userId");
CREATE INDEX "BalanceAdjustment_financialAccountId_idx" ON "BalanceAdjustment"("financialAccountId");
CREATE INDEX "BalanceAdjustment_userId_date_idx" ON "BalanceAdjustment"("userId", "date");

ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
