import { readFileSync } from 'fs';
import { join } from 'path';
import { NubankPdfParser } from './nubank-pdf.parser';

describe('NubankPdfParser', () => {
  const parser = new NubankPdfParser();

  it('parses the Nubank PDF statement into an intermediate preview format', () => {
    const sample = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'docs',
        'EXEMPLOS DE EXTRATOS',
        'nu',
        '2026-06-11_194724_Nubank_NU_470852067_01JUN2026_10JUN2026.pdf',
      ),
    );

    const parsed = parser.parse(sample);

    expect(parsed.provider).toBe('NUBANK');
    expect(parsed.sourceType).toBe('PDF');
    expect(parsed.accountNumber).toBe('47085206-7');
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
    expect(parsed.movements[3].rawDescription).not.toContain('Diogo Bazzanella');
    expect(parsed.movements[3].rawDescription).not.toContain('47085206-7');
    expect(parsed.movements[0].fingerprint).toHaveLength(64);
  });
});
