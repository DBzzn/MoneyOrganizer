import { createHash } from 'crypto';
import {
  ParsedStatementDirection,
  ParsedStatementMovement,
  StatementProvider,
} from '../types';

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKey(value: string): string {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeAccountKey(value?: string): string | undefined {
  const normalized = normalizeText(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return normalized || undefined;
}

export function normalizeExternalIdForDedupe(
  value?: string,
): string | undefined {
  const normalized = normalizeText(value ?? '')
    .toUpperCase()
    .replace(/:REVERSAL$/, '')
    .trim();

  return normalized || undefined;
}

export function decodeTextBuffer(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

export function parseIsoLikeDate(value?: string): string | undefined {
  const raw = value?.trim();

  if (!raw) {
    return undefined;
  }

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  const isoMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (brMatch) {
    const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
    return `${year}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
  }

  return undefined;
}

export function parseMoneyCents(value?: string): number | undefined {
  const raw = value?.trim();

  if (!raw) {
    return undefined;
  }

  const isParenthesized = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/[R$]/g, '')
    .replace(/[()]/g, '')
    .replace(/[^\d,.\-+]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '+') {
    return undefined;
  }

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : lastDot > -1 ? '.' : '';
  let normalized = cleaned;

  if (decimalSeparator === ',') {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (decimalSeparator === '.') {
    normalized = cleaned.replace(/,/g, '');
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const sign = isParenthesized ? -1 : 1;
  return Math.round(amount * 100) * sign;
}

const BR_MONTHS: Record<string, string> = {
  JAN: '01',
  FEV: '02',
  MAR: '03',
  ABR: '04',
  MAI: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  SET: '09',
  OUT: '10',
  NOV: '11',
  DEZ: '12',
};

function parseFileNameDateToken(value: string): string | undefined {
  const match = normalizeText(value)
    .toUpperCase()
    .match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  const month = match ? BR_MONTHS[match[2]] : undefined;

  if (!match || !month) {
    return undefined;
  }

  return `${match[3]}-${month}-${match[1]}`;
}

export function inferStatementPeriodFromFileName(fileName: string) {
  const match = normalizeText(fileName)
    .toUpperCase()
    .match(/_(\d{2}[A-Z]{3}\d{4})_(\d{2}[A-Z]{3}\d{4})(?=[_.-]|$)/);

  if (!match) {
    return {};
  }

  return {
    periodStart: parseFileNameDateToken(match[1]),
    periodEnd: parseFileNameDateToken(match[2]),
  };
}

export function inferAccountNumberFromFileName(
  fileName: string,
): string | undefined {
  const nubankMatch = fileName.match(
    /(?:^|[_\-\s])NU[_\-\s]?(\d{5,})(?=[_\-\s.]|$)/i,
  );
  if (nubankMatch) {
    const digits = nubankMatch[1];
    return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
  }

  const accountMatch = fileName.match(
    /(?:^|[_\-\s])(?:CONTA|ACCOUNT|ACCT)[_\-\s]?([A-Z0-9][A-Z0-9.\-]{3,})(?=[_\-\s.]|$)/i,
  );

  return accountMatch?.[1];
}

export function directionFromSignedAmount(
  amountCents: number,
): ParsedStatementDirection {
  return amountCents < 0 ? 'OUT' : 'IN';
}

export function inferProvider(value: string): StatementProvider {
  const normalized = normalizeText(value).toUpperCase();

  if (normalized.includes('NUBANK') || normalized.includes('NU PAGAMENTOS')) {
    return 'NUBANK';
  }

  if (normalized.includes('INTER')) {
    return 'INTER';
  }

  if (normalized.includes('ITAU') || normalized.includes('ITAÚ')) {
    return 'ITAU';
  }

  if (normalized.includes('SANTANDER')) {
    return 'SANTANDER';
  }

  if (normalized.includes('BRADESCO')) {
    return 'BRADESCO';
  }

  if (normalized.includes('CAIXA')) {
    return 'CAIXA';
  }

  if (normalized.includes('BANCO DO BRASIL') || normalized.includes('001')) {
    return 'BB';
  }

  if (normalized.includes('C6')) {
    return 'C6';
  }

  if (normalized.includes('MERCADO PAGO')) {
    return 'MERCADO_PAGO';
  }

  return 'UNKNOWN';
}

export function buildMovementFingerprint(
  provider: StatementProvider,
  accountNumber: string | undefined,
  movement: Omit<ParsedStatementMovement, 'fingerprint'>,
) {
  return createHash('sha256')
    .update(
      [
        provider,
        normalizeAccountKey(accountNumber) ?? '',
        movement.externalId ?? '',
        movement.date,
        movement.direction,
        movement.amountCents,
        normalizeText(movement.rawType).toUpperCase(),
        movement.normalizedDescription,
      ].join('|'),
    )
    .digest('hex');
}
