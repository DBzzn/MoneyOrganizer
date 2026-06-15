export type StatementProvider = 'NUBANK' | 'UNKNOWN';

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
