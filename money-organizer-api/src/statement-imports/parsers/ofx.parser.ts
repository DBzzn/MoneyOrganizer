import {
  ParsedStatement,
  ParsedStatementMovement,
  StatementProvider,
} from '../types';
import {
  buildMovementFingerprint,
  decodeTextBuffer,
  directionFromSignedAmount,
  inferProvider,
  normalizeText,
  parseIsoLikeDate,
  parseMoneyCents,
} from './parser-utils';
import { StatementParser } from './statement-parser';

function readTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, 'i'));
  return match?.[1]?.trim() || undefined;
}

function getTransactionBlocks(text: string): string[] {
  return [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>)|$)/gi)]
    .map((match) => match[1])
    .filter((block) => block.trim().length > 0);
}

function compactDescription(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const part of parts) {
    const value = part?.replace(/\s+/g, ' ').trim();
    if (!value) continue;

    const key = normalizeText(value).toUpperCase();
    if (seen.has(key)) continue;

    seen.add(key);
    values.push(value);
  }

  return values.join(' - ');
}

export class OfxParser implements StatementParser {
  readonly priority = 10;
  readonly label = 'OFX';

  canParse(fileName: string, mimeType: string, buffer: Buffer) {
    const lowerFileName = fileName.toLowerCase();
    const lowerMimeType = mimeType.toLowerCase();

    if (
      lowerFileName.endsWith('.ofx') ||
      lowerFileName.endsWith('.qfx') ||
      lowerMimeType.includes('ofx')
    ) {
      return true;
    }

    const sample = decodeTextBuffer(buffer.subarray(0, Math.min(buffer.length, 2048))).toUpperCase();
    return sample.includes('<OFX') && sample.includes('<STMTTRN>');
  }

  parse(buffer: Buffer, fileName: string): ParsedStatement {
    const text = decodeTextBuffer(buffer);
    const provider = inferProvider(
      [
        fileName,
        readTag(text, 'ORG'),
        readTag(text, 'BANKID'),
        readTag(text, 'BROKERID'),
      ].filter(Boolean).join(' '),
    );
    const accountNumber = readTag(text, 'ACCTID');
    const movements = this.parseMovements(text, provider, accountNumber);

    return {
      provider,
      sourceType: 'OFX',
      accountNumber,
      periodStart: parseIsoLikeDate(readTag(text, 'DTSTART')) ?? this.firstMovementDate(movements),
      periodEnd: parseIsoLikeDate(readTag(text, 'DTEND')) ?? this.lastMovementDate(movements),
      summary: {
        closingBalanceCents: parseMoneyCents(readTag(text, 'BALAMT')),
      },
      movements,
      warnings: movements.length === 0
        ? ['Nenhuma movimentacao foi identificada no OFX enviado.']
        : [],
    };
  }

  private parseMovements(
    text: string,
    provider: StatementProvider,
    accountNumber?: string,
  ): ParsedStatementMovement[] {
    return getTransactionBlocks(text).flatMap((block, index) => {
      const date = parseIsoLikeDate(readTag(block, 'DTPOSTED') ?? readTag(block, 'DTUSER'));
      const amountCents = parseMoneyCents(readTag(block, 'TRNAMT'));

      if (!date || amountCents === undefined) {
        return [];
      }

      const rawType = readTag(block, 'TRNTYPE') ?? 'OFX';
      const rawDescription = compactDescription([
        readTag(block, 'NAME'),
        readTag(block, 'MEMO'),
        readTag(block, 'CHECKNUM'),
      ]) || rawType;
      const normalizedDescription = normalizeText(rawDescription).toUpperCase();
      const movement = {
        date,
        amountCents: Math.abs(amountCents),
        direction: directionFromSignedAmount(amountCents),
        rawType,
        rawDescription,
        normalizedDescription,
        sourceLine: index + 1,
        externalId: readTag(block, 'FITID'),
      };

      return {
        ...movement,
        fingerprint: buildMovementFingerprint(provider, accountNumber, movement),
      };
    });
  }

  private firstMovementDate(movements: ParsedStatementMovement[]) {
    return movements
      .map((movement) => movement.date)
      .sort()[0];
  }

  private lastMovementDate(movements: ParsedStatementMovement[]) {
    const dates = movements.map((movement) => movement.date).sort();
    return dates[dates.length - 1];
  }
}
