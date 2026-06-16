import { ParsedStatement } from '../types';

export interface StatementParser {
  readonly priority: number;
  readonly label: string;
  canParse(fileName: string, mimeType: string, buffer: Buffer): boolean;
  parse(buffer: Buffer, fileName: string): ParsedStatement;
}
