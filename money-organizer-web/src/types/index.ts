export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  kind: "EXPENSE" | "INCOME" | "BOTH";
  isArchived: boolean;
  createdAt: string;
}

export type FinancialAccountType = "BANK_ACCOUNT" | "CASH_WALLET" | "OTHER";

export interface FinancialAccount {
  id: string;
  name: string;
  type: FinancialAccountType;
  institutionName?: string;
  icon?: string;
  color?: string;
  initialBalance: number;
  currentBalance: number;
  includeInDashboard: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppliedImportSource {
  id: string;
  appliedAt?: string | null;
  file: {
    id: string;
    originalName: string;
    provider: StatementProvider;
    sourceType: StatementSourceType;
    batchId: string;
  };
}

export type TransactionType =
  | "CREDIT_CASH"
  | "CREDIT_INSTALLMENT"
  | "DEBIT"
  | "PIX"
  | "CASH"
  | "INCOME";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  isPending: boolean;
  description?: string;
  totalInstallments?: number;
  currentInstallment?: number;
  installmentGroupId?: string;
  categoryId: string;
  category: Category;
  financialAccountId: string;
  financialAccount: FinancialAccount;
  importedMovements?: AppliedImportSource[];
  createdAt: string;
}

export interface Transfer {
  id: string;
  amount: number;
  date: string;
  isPending: boolean;
  description?: string;
  fromAccountId: string;
  fromAccount: FinancialAccount;
  toAccountId: string;
  toAccount: FinancialAccount;
  importedMovements?: AppliedImportSource[];
  createdAt: string;
  updatedAt: string;
}

export interface BalanceAdjustment {
  id: string;
  amount: number;
  date: string;
  reason: string;
  financialAccountId: string;
  financialAccount: FinancialAccount;
  createdAt: string;
  updatedAt: string;
}

export type ReminderStatus = "PENDING" | "DONE" | "CANCELED";

export interface Reminder {
  id: string;
  title: string;
  dueDate: string;
  amount?: number | null;
  status: ReminderStatus;
  note?: string | null;
  financialAccountId?: string | null;
  financialAccount?: Pick<
    FinancialAccount,
    "id" | "name" | "type" | "institutionName" | "icon" | "color" | "isArchived"
  > | null;
  categoryId?: string | null;
  category?: Pick<Category, "id" | "name" | "icon" | "kind" | "isArchived"> | null;
  createdAt: string;
  updatedAt: string;
}

export type StatementMovementDirection = "IN" | "OUT";

export type StatementProvider =
  | "NUBANK"
  | "INTER"
  | "ITAU"
  | "SANTANDER"
  | "BRADESCO"
  | "CAIXA"
  | "BB"
  | "C6"
  | "MERCADO_PAGO"
  | "UNKNOWN";

export type StatementSourceType = "PDF" | "CSV" | "XLSX" | "OFX";

export type StatementImportBatchStatus =
  | "DRAFT"
  | "REVIEWING"
  | "READY"
  | "APPLIED"
  | "PARTIALLY_APPLIED"
  | "CANCELED";

export type StatementImportFileStatus = "PARSED" | "DUPLICATE" | "FAILED";

export type ImportedMovementStatus =
  | "NEW"
  | "DUPLICATE"
  | "IGNORED"
  | "READY"
  | "NEEDS_REVIEW"
  | "APPLIED";

export type ImportedMovementReviewTarget = "TRANSACTION" | "TRANSFER";

export type ImportedMovementReconciliationStatus =
  | "PENDING"
  | "CONFIRMED_UNIQUE"
  | "CONFIRMED_DUPLICATE";

export interface StatementImportPreviewMovement {
  date: string;
  amountCents: number;
  direction: StatementMovementDirection;
  rawType: string;
  rawDescription: string;
  normalizedDescription: string;
  sourcePage?: number;
  sourceLine?: number;
  externalId?: string | null;
  fingerprint: string;
}

export interface StatementImportPreview {
  file: {
    originalName: string;
    size: number;
    mimeType: string;
    sha256: string;
  };
  targetAccount?: Pick<
    FinancialAccount,
    "id" | "name" | "type" | "institutionName" | "icon" | "color" | "isArchived"
  > | null;
  provider: StatementProvider;
  sourceType: StatementSourceType;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  summary?: {
    openingBalanceCents?: number;
    closingBalanceCents?: number;
    totalInCents?: number;
    totalOutCents?: number;
  };
  movements: StatementImportPreviewMovement[];
  warnings: string[];
}

export interface ImportedMovement {
  id: string;
  date: string;
  amountCents: number;
  direction: StatementMovementDirection;
  rawType: string;
  rawDescription: string;
  normalizedDescription: string;
  sourcePage?: number | null;
  sourceLine?: number | null;
  fingerprint: string;
  externalId?: string | null;
  status: ImportedMovementStatus;
  reviewTarget: ImportedMovementReviewTarget;
  reviewCategoryId?: string | null;
  reviewCategory?: Pick<Category, "id" | "name" | "icon" | "kind" | "isArchived"> | null;
  reviewTransferAccountId?: string | null;
  reviewTransferAccount?: Pick<
    FinancialAccount,
    "id" | "name" | "type" | "institutionName" | "icon" | "color" | "isArchived"
  > | null;
  reconciliationStatus: ImportedMovementReconciliationStatus;
  reconciliationNote?: string | null;
  reconciliationReviewedAt?: string | null;
  appliedTransactionId?: string | null;
  appliedTransferId?: string | null;
  appliedAt?: string | null;
  reviewHints?: ImportedMovementReviewHints;
  createdAt: string;
  updatedAt: string;
}

export type ImportedMovementReviewMatchSource =
  | "TRANSACTION"
  | "TRANSFER"
  | "BALANCE_ADJUSTMENT";

export interface ImportedMovementReviewMatch {
  sourceType: ImportedMovementReviewMatchSource;
  sourceId: string;
  date: string;
  direction: StatementMovementDirection;
  amountCents: number;
  label: string;
}

export interface ImportedMovementCategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  confidence: "EXACT_DESCRIPTION";
  basedOnCount: number;
}

export interface ImportedMovementReviewHints {
  reconciliationMatches: ImportedMovementReviewMatch[];
  categorySuggestion?: ImportedMovementCategorySuggestion;
  flags: string[];
}

export interface UpdateImportedMovementPayload {
  date?: string;
  amountCents?: number;
  direction?: StatementMovementDirection;
  rawType?: string;
  reviewTarget?: ImportedMovementReviewTarget;
  reviewCategoryId?: string | null;
  reviewTransferAccountId?: string | null;
  reconciliationStatus?: ImportedMovementReconciliationStatus;
  reconciliationNote?: string | null;
  rawDescription?: string;
}

export interface StatementImportFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  provider: StatementProvider;
  sourceType: StatementSourceType;
  fileHash: string;
  status: StatementImportFileStatus;
  duplicateOfFileId?: string | null;
  accountNumber?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  openingBalanceCents?: number | null;
  closingBalanceCents?: number | null;
  totalInCents?: number | null;
  totalOutCents?: number | null;
  warnings?: string[] | null;
  financialAccountId?: string | null;
  financialAccount?: Pick<
    FinancialAccount,
    "id" | "name" | "type" | "institutionName" | "icon" | "color" | "isArchived"
  > | null;
  movements: ImportedMovement[];
  createdAt: string;
  updatedAt: string;
}

export interface StatementImportBatch {
  id: string;
  status: StatementImportBatchStatus;
  createdAt: string;
  updatedAt: string;
  files: StatementImportFile[];
}

export interface StatementImportApplyResult {
  appliedCount: number;
  transactionCount: number;
  transferCount: number;
  batchStatus: StatementImportBatchStatus;
  batch: StatementImportBatch;
}

export interface StatementImportUndoResult {
  undoneCount: number;
  transactionCount: number;
  transferCount: number;
  batchStatus: StatementImportBatchStatus;
  batch: StatementImportBatch;
}

export interface StatementImportBatchSummaryFile {
  id: string;
  originalName: string;
  provider: StatementProvider;
  sourceType: StatementSourceType;
  fileHash: string;
  status: StatementImportFileStatus;
  duplicateOfFileId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  financialAccount?: Pick<
    FinancialAccount,
    "id" | "name" | "type" | "institutionName" | "icon" | "color" | "isArchived"
  > | null;
  _count: {
    movements: number;
  };
}

export interface StatementImportBatchSummary {
  id: string;
  status: StatementImportBatchStatus;
  createdAt: string;
  updatedAt: string;
  files: StatementImportBatchSummaryFile[];
}

export type AccountLedgerMovementType =
  | "TRANSACTION_INCOME"
  | "TRANSACTION_EXPENSE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "BALANCE_ADJUSTMENT";

export interface AccountLedgerItem {
  id: string;
  sourceId: string;
  sourceType: "TRANSACTION" | "TRANSFER" | "BALANCE_ADJUSTMENT";
  movementType: AccountLedgerMovementType;
  date: string;
  createdAt: string;
  title: string;
  description?: string | null;
  amount: number;
  signedAmount: number;
  balanceAfter: number;
  affectsCurrentBalance: boolean;
  isPending: boolean;
  transactionType?: TransactionType;
  category?: Pick<Category, "id" | "name" | "icon" | "kind" | "isArchived">;
  relatedAccount?: Pick<
    FinancialAccount,
    "id" | "name" | "icon" | "color" | "isArchived"
  >;
}

export interface AccountLedgerResponse {
  account: FinancialAccount;
  filters: {
    startDate?: string | null;
    endDate?: string | null;
  };
  openingBalance: number;
  closingBalance: number;
  totals: {
    income: number;
    expenses: number;
    incomingTransfers: number;
    outgoingTransfers: number;
    adjustments: number;
    netChange: number;
    effectiveNetChange: number;
    pendingCount: number;
  };
  items: AccountLedgerItem[];
}

export interface MonthlyBalance {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  transactionCount: {
    income: number;
    expenses: number;
    total: number;
  };
}

export interface ProjectionEntry {
  month: string;
  projectedIncome: number;
  projectedExpenses: number;
  projectedBalance: number;
  pendingTransactions: number;
}

export interface EvolutionEntry {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  transactionCount: {
    income: number;
    expenses: number;
    total: number;
  };
}

// DEPOIS
export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  totalAmount: string;
  transactionCount: number;
}

export interface InstallmentResponse {
  message: string;
  installmentGroupId: string;
  totalInstallments: number;
  totalAmount: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
}
