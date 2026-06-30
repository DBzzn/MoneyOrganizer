import { readFileSync, readdirSync } from 'fs';
import { extname, join, resolve } from 'path';
import { NubankPdfParser } from './nubank-pdf.parser';
import { inferAccountNumberFromFileName } from './parser-utils';

const FIXTURES_DIR = resolve(
  __dirname,
  '../../../../docs/EXEMPLOS DE EXTRATOS/NU',
);

function fixtureFile(periodStart: string, periodEnd: string) {
  const periodToken = `_${periodStart}_${periodEnd}`;
  const fileName = readdirSync(FIXTURES_DIR)
    .filter(
      (candidate) =>
        extname(candidate).toLowerCase() === '.pdf' &&
        candidate.includes(periodToken),
    )
    .sort()[0];

  if (!fileName) {
    throw new Error(`Missing Nubank PDF fixture for ${periodToken}`);
  }

  return fileName;
}

function fixtureAccountNumber(fileName: string) {
  const accountNumber = inferAccountNumberFromFileName(fileName);

  if (!accountNumber) {
    throw new Error(`Invalid fixture account token: ${fileName}`);
  }

  return accountNumber;
}

describe('NubankPdfParser', () => {
  const parser = new NubankPdfParser();

  it('parses the Nubank PDF statement into an intermediate preview format', () => {
    const fileName = fixtureFile('01JUN2026', '10JUN2026');
    const accountNumber = fixtureAccountNumber(fileName);
    const sample = readFileSync(join(FIXTURES_DIR, fileName));

    const parsed = parser.parse(sample);

    expect(parsed.provider).toBe('NUBANK');
    expect(parsed.sourceType).toBe('PDF');
    expect(parsed.accountNumber).toBe(accountNumber);
    expect(parsed.periodStart).toBe('2026-06-01');
    expect(parsed.periodEnd).toBe('2026-06-10');
    expect(parsed.summary).toMatchObject({
      openingBalanceCents: 190,
      closingBalanceCents: 249482,
      totalInCents: 276532,
      totalOutCents: 27240,
    });
    expect(parsed.movements).toHaveLength(4);
    expect(parsed.movements[0]).toMatchObject({
      date: '2026-06-05',
      amountCents: 44600,
      direction: 'IN',
      rawType: 'Transferência recebida pelo Pix',
    });
    expect(parsed.movements[3]).toMatchObject({
      date: '2026-06-07',
      amountCents: 2950,
      direction: 'OUT',
      rawType: 'Transferência enviada pelo Pix',
    });
    expect(parsed.movements[3].rawDescription).not.toMatch(
      /Extrato gerado|Ouvidoria|VALORES EM R\$/i,
    );
    expect(parsed.movements[3].rawDescription).not.toContain(accountNumber);
    expect(parsed.movements[0].fingerprint).toHaveLength(64);
  });
});
