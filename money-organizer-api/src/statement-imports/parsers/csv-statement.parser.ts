import {
  ParsedStatement,
  ParsedStatementDirection,
  ParsedStatementMovement,
  StatementProvider,
} from '../types';
import {
  buildMovementFingerprint,
  decodeTextBuffer,
  directionFromSignedAmount,
  inferAccountNumberFromFileName,
  inferProvider,
  inferStatementPeriodFromFileName,
  normalizeKey,
  normalizeText,
  parseIsoLikeDate,
  parseMoneyCents,
} from './parser-utils';
import { StatementParser } from './statement-parser';

type CsvRow = Record<string, string>;

const DATE_KEYS = [
  'DATA',
  'DATE',
  'DTPOSTED',
  'DATALANCAMENTO',
  'DATATRANSACAO',
];
const DESCRIPTION_KEYS = [
  'DESCRICAO',
  'DESCRICAO',
  'HISTORICO',
  'MEMO',
  'NAME',
  'NOME',
  'LANCAMENTO',
  'DETALHE',
];
const AMOUNT_KEYS = ['VALOR', 'AMOUNT', 'TRNAMT', 'QUANTIA'];
const CREDIT_KEYS = ['CREDITO', 'CREDIT', 'ENTRADA', 'RECEITA'];
const DEBIT_KEYS = ['DEBITO', 'DEBIT', 'SAIDA', 'DESPESA'];
const TYPE_KEYS = ['TIPO', 'TYPE', 'TRNTYPE', 'CATEGORIA'];
const DIRECTION_KEYS = ['DIRECAO', 'DIRECTION', 'NATUREZA'];
const EXTERNAL_ID_KEYS = [
  'FITID',
  'ID',
  'IDENTIFICADOR',
  'NSU',
  'CODIGO',
  'DOCUMENTO',
];
const ACCOUNT_KEYS = ['CONTA', 'ACCOUNT', 'ACCTID', 'CONTAORIGEM'];

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: splitCsvLine(headerLine, delimiter).length,
    }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function findValue(row: CsvRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function inferDirectionFromText(
  value?: string,
): ParsedStatementDirection | undefined {
  const normalized = normalizeText(value ?? '').toUpperCase();

  if (
    normalized.includes('CREDITO') ||
    normalized.includes('CREDIT') ||
    normalized.includes('ENTRADA') ||
    normalized.includes('RECEITA')
  ) {
    return 'IN';
  }

  if (
    normalized.includes('DEBITO') ||
    normalized.includes('DEBIT') ||
    normalized.includes('SAIDA') ||
    normalized.includes('DESPESA')
  ) {
    return 'OUT';
  }

  return undefined;
}

function getAmountAndDirection(row: CsvRow) {
  const signedAmount = parseMoneyCents(findValue(row, AMOUNT_KEYS));
  if (signedAmount !== undefined) {
    return {
      amountCents: Math.abs(signedAmount),
      direction:
        inferDirectionFromText(
          findValue(row, DIRECTION_KEYS) ?? findValue(row, TYPE_KEYS),
        ) ?? directionFromSignedAmount(signedAmount),
    };
  }

  const creditAmount = parseMoneyCents(findValue(row, CREDIT_KEYS));
  if (creditAmount !== undefined && creditAmount !== 0) {
    return {
      amountCents: Math.abs(creditAmount),
      direction: 'IN' as const,
    };
  }

  const debitAmount = parseMoneyCents(findValue(row, DEBIT_KEYS));
  if (debitAmount !== undefined && debitAmount !== 0) {
    return {
      amountCents: Math.abs(debitAmount),
      direction: 'OUT' as const,
    };
  }

  return undefined;
}

export class CsvStatementParser implements StatementParser {
  readonly priority = 20;
  readonly label = 'CSV/TSV';

  canParse(fileName: string, mimeType: string, buffer: Buffer) {
    const lowerFileName = fileName.toLowerCase();
    const lowerMimeType = mimeType.toLowerCase();
    const sample = decodeTextBuffer(
      buffer.subarray(0, Math.min(buffer.length, 2048)),
    ).trimStart();
    const firstLine = sample.split(/\r?\n/).find(Boolean) ?? '';
    const looksDelimited = [',', ';', '\t'].some(
      (delimiter) => splitCsvLine(firstLine, delimiter).length > 1,
    );

    if (
      sample.toUpperCase().startsWith('OFX') ||
      sample.toUpperCase().includes('<OFX')
    ) {
      return false;
    }

    return (
      lowerFileName.endsWith('.csv') ||
      lowerFileName.endsWith('.tsv') ||
      (lowerFileName.endsWith('.txt') && looksDelimited) ||
      lowerMimeType.includes('csv') ||
      lowerMimeType.includes('tab-separated-values') ||
      lowerMimeType.includes('vnd.ms-excel')
    );
  }

  parse(buffer: Buffer, fileName: string): ParsedStatement {
    const text = decodeTextBuffer(buffer);
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return {
        provider: inferProvider(fileName),
        sourceType: 'CSV',
        movements: [],
        warnings: [
          'O CSV enviado não possui linhas suficientes para importação.',
        ],
      };
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = splitCsvLine(lines[0], delimiter).map(normalizeKey);
    const rows = lines.slice(1).map((line) => {
      const values = splitCsvLine(line, delimiter);
      return headers.reduce<CsvRow>((row, header, index) => {
        row[header] = values[index] ?? '';
        return row;
      }, {});
    });
    const accountNumber =
      rows.map((row) => findValue(row, ACCOUNT_KEYS)).find(Boolean) ??
      inferAccountNumberFromFileName(fileName);
    const provider = inferProvider([fileName, text.slice(0, 500)].join(' '));
    const inferredPeriod = inferStatementPeriodFromFileName(fileName);
    const skippedRows: number[] = [];
    const movements = rows.flatMap((row, index) => {
      const date = parseIsoLikeDate(findValue(row, DATE_KEYS));
      const amount = getAmountAndDirection(row);

      if (!date || !amount) {
        skippedRows.push(index + 2);
        return [];
      }

      const rawType = findValue(row, TYPE_KEYS) ?? 'CSV';
      const rawDescription = findValue(row, DESCRIPTION_KEYS) ?? rawType;
      const movement = {
        date,
        amountCents: amount.amountCents,
        direction: amount.direction,
        rawType,
        rawDescription,
        normalizedDescription: normalizeText(rawDescription).toUpperCase(),
        sourceLine: index + 2,
        externalId: findValue(row, EXTERNAL_ID_KEYS),
      };

      return {
        ...movement,
        fingerprint: buildMovementFingerprint(
          provider,
          accountNumber,
          movement,
        ),
      };
    });

    return {
      provider,
      sourceType: 'CSV',
      accountNumber,
      periodStart:
        inferredPeriod.periodStart ?? this.firstMovementDate(movements),
      periodEnd: inferredPeriod.periodEnd ?? this.lastMovementDate(movements),
      summary: this.buildSummary(movements),
      movements,
      warnings: [
        ...(movements.length === 0
          ? ['Nenhuma movimentação foi identificada no CSV enviado.']
          : []),
        ...(skippedRows.length > 0
          ? [
              `${skippedRows.length} linha(s) foram ignoradas por falta de data ou valor.`,
            ]
          : []),
      ],
    };
  }

  private buildSummary(movements: ParsedStatementMovement[]) {
    return movements.reduce(
      (summary, movement) => {
        if (movement.direction === 'IN') {
          summary.totalInCents += movement.amountCents;
        } else {
          summary.totalOutCents += movement.amountCents;
        }

        return summary;
      },
      { totalInCents: 0, totalOutCents: 0 },
    );
  }

  private firstMovementDate(movements: ParsedStatementMovement[]) {
    return movements.map((movement) => movement.date).sort()[0];
  }

  private lastMovementDate(movements: ParsedStatementMovement[]) {
    const dates = movements.map((movement) => movement.date).sort();
    return dates[dates.length - 1];
  }
}
