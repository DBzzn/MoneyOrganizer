export type StatementProvider =
  | 'NUBANK'
  | 'INTER'
  | 'ITAU'
  | 'SANTANDER'
  | 'BRADESCO'
  | 'CAIXA'
  | 'BB'
  | 'C6'
  | 'MERCADO_PAGO'
  | 'UNKNOWN';

export type StatementSourceType = 'PDF' | 'CSV' | 'XLSX' | 'OFX';

export type ParsedStatementDirection = 'IN' | 'OUT';

export interface ParsedStatementSummary {
  openingBalanceCents?: number;
  closingBalanceCents?: number;
  totalInCents?: number;
  totalOutCents?: number;
}

export interface ParsedStatementMovement {
  date: string;
  amountCents: number;
  direction: ParsedStatementDirection;
  rawType: string;
  rawDescription: string;
  normalizedDescription: string;
  sourcePage?: number;
  sourceLine?: number;
  externalId?: string;
  fingerprint: string;
}

export interface ParsedStatement {
  provider: StatementProvider;
  sourceType: StatementSourceType;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  summary?: ParsedStatementSummary;
  movements: ParsedStatementMovement[];
  warnings: string[];
}

export type ImportedMovementReviewMatchSource =
  | 'TRANSACTION'
  | 'TRANSFER'
  | 'BALANCE_ADJUSTMENT';

export interface ImportedMovementReviewMatch {
  sourceType: ImportedMovementReviewMatchSource;
  sourceId: string;
  date: string;
  direction: ParsedStatementDirection;
  amountCents: number;
  label: string;
}

export interface ImportedMovementCategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  confidence: 'EXACT_DESCRIPTION';
  basedOnCount: number;
}

export interface ImportedMovementReviewHints {
  reconciliationMatches: ImportedMovementReviewMatch[];
  categorySuggestion?: ImportedMovementCategorySuggestion;
  flags: string[];
}

export interface StatementPreviewFile {
  originalName: string;
  size: number;
  mimeType: string;
  sha256: string;
}

export interface UploadedStatementFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}
