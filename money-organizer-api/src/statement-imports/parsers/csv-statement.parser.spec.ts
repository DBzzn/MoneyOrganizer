import { CsvStatementParser } from './csv-statement.parser';

describe('CsvStatementParser', () => {
  const parser = new CsvStatementParser();

  it('parses semicolon CSV statements with signed amount values', () => {
    const sample = Buffer.from(
      [
        'Data;Descricao;Valor;Tipo;Identificador;Conta',
        '02/05/2026;Salario;R$ 4.500,10;Credito;csv-1;12345-6',
        '03/05/2026;Mercado;-123,45;Debito;csv-2;12345-6',
      ].join('\n'),
    );

    const parsed = parser.parse(sample, 'extrato-inter.csv');

    expect(parsed.provider).toBe('INTER');
    expect(parsed.sourceType).toBe('CSV');
    expect(parsed.accountNumber).toBe('12345-6');
    expect(parsed.periodStart).toBe('2026-05-02');
    expect(parsed.periodEnd).toBe('2026-05-03');
    expect(parsed.summary).toMatchObject({
      totalInCents: 450010,
      totalOutCents: 12345,
    });
    expect(parsed.movements).toHaveLength(2);
    expect(parsed.movements[0]).toMatchObject({
      date: '2026-05-02',
      amountCents: 450010,
      direction: 'IN',
      externalId: 'csv-1',
    });
    expect(parsed.movements[1]).toMatchObject({
      date: '2026-05-03',
      amountCents: 12345,
      direction: 'OUT',
      externalId: 'csv-2',
    });
    expect(parsed.movements[0].fingerprint).toHaveLength(64);
  });

  it('parses credit and debit columns when amount is split', () => {
    const sample = Buffer.from(
      [
        'date,description,credit,debit,id',
        '2026-06-01,Transfer received,100.00,,row-1',
        '2026-06-02,Card purchase,,25.10,row-2',
      ].join('\n'),
    );

    const parsed = parser.parse(sample, 'statement.csv');

    expect(parsed.movements).toHaveLength(2);
    expect(parsed.movements[0]).toMatchObject({
      amountCents: 10000,
      direction: 'IN',
    });
    expect(parsed.movements[1]).toMatchObject({
      amountCents: 2510,
      direction: 'OUT',
    });
  });
});
