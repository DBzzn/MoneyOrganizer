import { OfxParser } from './ofx.parser';

describe('OfxParser', () => {
  const parser = new OfxParser();

  it('parses OFX transactions using FITID as external id', () => {
    const sample = Buffer.from(`
OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <FI>
        <ORG>BANCO INTER
      </FI>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKACCTFROM>
          <BANKID>077
          <ACCTID>12345-6
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20260501000000[-3:BRT]
          <DTEND>20260531000000[-3:BRT]
          <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20260502120000[-3:BRT]
            <TRNAMT>150.25
            <FITID>fit-1
            <NAME>Pix recebido
            <MEMO>Cliente A
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20260503120000[-3:BRT]
            <TRNAMT>-12.30
            <FITID>fit-2
            <NAME>Compra debito
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>137.95
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`);

    const parsed = parser.parse(sample, 'inter.ofx');

    expect(parsed.provider).toBe('INTER');
    expect(parsed.sourceType).toBe('OFX');
    expect(parsed.accountNumber).toBe('12345-6');
    expect(parsed.periodStart).toBe('2026-05-01');
    expect(parsed.periodEnd).toBe('2026-05-31');
    expect(parsed.summary?.closingBalanceCents).toBe(13795);
    expect(parsed.movements).toHaveLength(2);
    expect(parsed.movements[0]).toMatchObject({
      date: '2026-05-02',
      amountCents: 15025,
      direction: 'IN',
      rawType: 'CREDIT',
      externalId: 'fit-1',
    });
    expect(parsed.movements[1]).toMatchObject({
      date: '2026-05-03',
      amountCents: 1230,
      direction: 'OUT',
      rawType: 'DEBIT',
      externalId: 'fit-2',
    });
    expect(parsed.movements[0].fingerprint).toHaveLength(64);
  });
});
