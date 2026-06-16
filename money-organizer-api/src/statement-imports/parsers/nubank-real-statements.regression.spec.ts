import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { extname, join, resolve } from 'path';
import { ParsedStatement } from '../types';
import { CsvStatementParser } from './csv-statement.parser';
import { OfxParser } from './ofx.parser';

type RawMovement = {
  date: string;
  signedAmountCents: number;
  externalId: string;
};

type RawExpectation = {
  accountNumber?: string;
  count: number;
  periodStart: string;
  periodEnd: string;
  transactionStart: string;
  transactionEnd: string;
  totalInCents: number;
  totalOutCents: number;
  netCents: number;
  externalIds: string[];
};

const FIXTURES_DIR = resolve(
  __dirname,
  '../../../../docs/EXEMPLOS DE EXTRATOS/NU',
);
const describeRealFixtures = existsSync(FIXTURES_DIR)
  ? describe
  : describe.skip;
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

function fixtureFiles(extension: '.csv' | '.ofx') {
  if (!existsSync(FIXTURES_DIR)) {
    return [];
  }

  return readdirSync(FIXTURES_DIR)
    .filter((fileName) => extname(fileName).toLowerCase() === extension)
    .sort();
}

function fixtureBuffer(fileName: string) {
  return readFileSync(join(FIXTURES_DIR, fileName));
}

function parseSignedCents(value: string) {
  return Math.round(Number(value.trim().replace(',', '.')) * 100);
}

function parseBrDate(value: string) {
  const [day, month, year] = value.split('/');
  return `${year}-${month}-${day}`;
}

function parseOfxDate(value?: string) {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})/);

  if (!match) {
    throw new Error(`Invalid OFX date: ${value}`);
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function readTag(block: string, tag: string) {
  return block.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, 'i'))?.[1]?.trim();
}

function parseFileNameDate(token: string) {
  const match = token.toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  const month = match ? BR_MONTHS[match[2]] : undefined;

  if (!match || !month) {
    throw new Error(`Invalid file date token: ${token}`);
  }

  return `${match[3]}-${month}-${match[1]}`;
}

function periodFromFileName(fileName: string) {
  const match = fileName
    .toUpperCase()
    .match(/_(\d{2}[A-Z]{3}\d{4})_(\d{2}[A-Z]{3}\d{4})\.(CSV|OFX)$/);

  if (!match) {
    throw new Error(`Invalid fixture file name: ${fileName}`);
  }

  return {
    periodStart: parseFileNameDate(match[1]),
    periodEnd: parseFileNameDate(match[2]),
  };
}

function summarizeRawMovements(
  movements: RawMovement[],
  period: Pick<RawExpectation, 'periodStart' | 'periodEnd'>,
  accountNumber?: string,
): RawExpectation {
  const sortedDates = movements.map((movement) => movement.date).sort();

  return {
    ...period,
    accountNumber,
    count: movements.length,
    transactionStart: sortedDates[0],
    transactionEnd: sortedDates[sortedDates.length - 1],
    totalInCents: movements
      .filter((movement) => movement.signedAmountCents > 0)
      .reduce((total, movement) => total + movement.signedAmountCents, 0),
    totalOutCents: Math.abs(
      movements
        .filter((movement) => movement.signedAmountCents < 0)
        .reduce((total, movement) => total + movement.signedAmountCents, 0),
    ),
    netCents: movements.reduce(
      (total, movement) => total + movement.signedAmountCents,
      0,
    ),
    externalIds: movements.map((movement) => movement.externalId),
  };
}

function csvExpectation(fileName: string) {
  const lines = fixtureBuffer(fileName)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  const movements = lines.slice(1).map((line) => {
    const [date, amount, externalId] = line.split(',', 3);

    return {
      date: parseBrDate(date),
      signedAmountCents: parseSignedCents(amount),
      externalId,
    };
  });

  return summarizeRawMovements(
    movements,
    periodFromFileName(fileName),
    '47085206-7',
  );
}

function ofxExpectation(fileName: string) {
  const text = fixtureBuffer(fileName).toString('utf8');
  const movements = [
    ...text.matchAll(
      /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>)|$)/gi,
    ),
  ].map((match) => {
    const block = match[1];

    return {
      date: parseOfxDate(readTag(block, 'DTPOSTED')),
      signedAmountCents: parseSignedCents(readTag(block, 'TRNAMT') ?? ''),
      externalId: readTag(block, 'FITID') ?? '',
    };
  });

  return summarizeRawMovements(
    movements,
    {
      periodStart: parseOfxDate(readTag(text, 'DTSTART')),
      periodEnd: parseOfxDate(readTag(text, 'DTEND')),
    },
    readTag(text, 'ACCTID'),
  );
}

function parsedTotals(parsed: ParsedStatement) {
  return parsed.movements.reduce(
    (totals, movement) => {
      if (movement.direction === 'IN') {
        totals.totalInCents += movement.amountCents;
        totals.netCents += movement.amountCents;
      } else {
        totals.totalOutCents += movement.amountCents;
        totals.netCents -= movement.amountCents;
      }

      return totals;
    },
    { totalInCents: 0, totalOutCents: 0, netCents: 0 },
  );
}

function sorted(values: string[]) {
  return [...values].sort();
}

function normalizedExternalIdSet(values: string[]) {
  return sorted([
    ...new Set(values.map((value) => value.replace(/:reversal$/i, ''))),
  ]);
}

function parsedExternalIds(parsed: ParsedStatement) {
  return parsed.movements.map((movement) => movement.externalId ?? '');
}

function fileHash(fileName: string) {
  return createHash('sha256').update(fixtureBuffer(fileName)).digest('hex');
}

describeRealFixtures('Nubank real statement fixtures regression', () => {
  const csvParser = new CsvStatementParser();
  const ofxParser = new OfxParser();
  const csvFiles = fixtureFiles('.csv');
  const ofxFiles = fixtureFiles('.ofx');

  it('parses all real Nubank OFX files with account, period, totals and FITID', () => {
    expect(ofxFiles).toHaveLength(19);

    for (const fileName of ofxFiles) {
      const buffer = fixtureBuffer(fileName);
      const expected = ofxExpectation(fileName);
      const parsed = ofxParser.parse(buffer, fileName);

      expect(ofxParser.canParse(fileName, 'application/x-ofx', buffer)).toBe(
        true,
      );
      expect(parsed.provider).toBe('NUBANK');
      expect(parsed.sourceType).toBe('OFX');
      expect(parsed.accountNumber).toBe(expected.accountNumber);
      expect(parsed.periodStart).toBe(expected.periodStart);
      expect(parsed.periodEnd).toBe(expected.periodEnd);
      expect(parsed.warnings).toEqual([]);
      expect(parsed.movements).toHaveLength(expected.count);
      expect(parsedTotals(parsed)).toEqual({
        totalInCents: expected.totalInCents,
        totalOutCents: expected.totalOutCents,
        netCents: expected.netCents,
      });
      expect(sorted(parsedExternalIds(parsed))).toEqual(
        sorted(expected.externalIds),
      );
      expect(
        new Set(parsed.movements.map((movement) => movement.fingerprint)).size,
      ).toBe(expected.count);
    }
  });

  it('parses all real Nubank CSV files with filename account, filename period, totals and ids', () => {
    expect(csvFiles).toHaveLength(19);

    const filesWithRepeatedExternalIds: string[] = [];

    for (const fileName of csvFiles) {
      const buffer = fixtureBuffer(fileName);
      const expected = csvExpectation(fileName);
      const parsed = csvParser.parse(buffer, fileName);
      const uniqueExternalIds = new Set(expected.externalIds);

      if (uniqueExternalIds.size < expected.externalIds.length) {
        filesWithRepeatedExternalIds.push(fileName);
      }

      expect(csvParser.canParse(fileName, 'text/csv', buffer)).toBe(true);
      expect(parsed.provider).toBe('NUBANK');
      expect(parsed.sourceType).toBe('CSV');
      expect(parsed.accountNumber).toBe(expected.accountNumber);
      expect(parsed.periodStart).toBe(expected.periodStart);
      expect(parsed.periodEnd).toBe(expected.periodEnd);
      expect(parsed.warnings).toEqual([]);
      expect(parsed.movements).toHaveLength(expected.count);
      expect(parsedTotals(parsed)).toEqual({
        totalInCents: expected.totalInCents,
        totalOutCents: expected.totalOutCents,
        netCents: expected.netCents,
      });
      expect(sorted(parsedExternalIds(parsed))).toEqual(
        sorted(expected.externalIds),
      );
      expect(
        new Set(parsed.movements.map((movement) => movement.fingerprint)).size,
      ).toBe(expected.count);
    }

    expect(filesWithRepeatedExternalIds.length).toBeGreaterThan(0);
  });

  it('keeps CSV and OFX exports aligned for each real monthly pair', () => {
    expect(csvFiles).toHaveLength(19);
    expect(ofxFiles).toHaveLength(19);

    for (const csvFileName of csvFiles) {
      const ofxFileName = csvFileName.replace(/\.csv$/i, '.ofx');
      expect(ofxFiles).toContain(ofxFileName);

      const csvParsed = csvParser.parse(
        fixtureBuffer(csvFileName),
        csvFileName,
      );
      const ofxParsed = ofxParser.parse(
        fixtureBuffer(ofxFileName),
        ofxFileName,
      );

      expect(csvParsed.periodStart).toBe(ofxParsed.periodStart);
      expect(csvParsed.periodEnd).toBe(ofxParsed.periodEnd);
      expect(csvParsed.accountNumber).toBe(ofxParsed.accountNumber);
      expect(csvParsed.movements).toHaveLength(ofxParsed.movements.length);
      expect(parsedTotals(csvParsed)).toEqual(parsedTotals(ofxParsed));
      expect(normalizedExternalIdSet(parsedExternalIds(csvParsed))).toEqual(
        normalizedExternalIdSet(parsedExternalIds(ofxParsed)),
      );
    }
  });

  it('preserves the duplicated October 2025 exports as duplicate-file fixtures', () => {
    const octoberCsvFiles = csvFiles.filter((fileName) =>
      fileName.includes('01OUT2025_31OUT2025'),
    );
    const octoberOfxFiles = ofxFiles.filter((fileName) =>
      fileName.includes('01OUT2025_31OUT2025'),
    );

    expect(octoberCsvFiles).toHaveLength(2);
    expect(octoberOfxFiles).toHaveLength(2);
    expect(new Set(octoberCsvFiles.map(fileHash)).size).toBe(1);
    expect(new Set(octoberOfxFiles.map(fileHash)).size).toBe(1);

    const [firstCsv, secondCsv] = octoberCsvFiles.map((fileName) =>
      csvParser.parse(fixtureBuffer(fileName), fileName),
    );
    const [firstOfx, secondOfx] = octoberOfxFiles.map((fileName) =>
      ofxParser.parse(fixtureBuffer(fileName), fileName),
    );

    expect(firstCsv.movements.map((movement) => movement.fingerprint)).toEqual(
      secondCsv.movements.map((movement) => movement.fingerprint),
    );
    expect(firstOfx.movements.map((movement) => movement.fingerprint)).toEqual(
      secondOfx.movements.map((movement) => movement.fingerprint),
    );
  });
});
