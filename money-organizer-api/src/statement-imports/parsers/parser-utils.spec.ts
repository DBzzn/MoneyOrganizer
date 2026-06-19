import { parseMoneyCents } from './parser-utils';

describe('parseMoneyCents', () => {
  it('keeps decimal scale for Brazilian and OFX-style money values', () => {
    expect(parseMoneyCents('200.00')).toBe(20000);
    expect(parseMoneyCents('200,00')).toBe(20000);
    expect(parseMoneyCents('-200.00')).toBe(-20000);
    expect(parseMoneyCents('-200,00')).toBe(-20000);
  });

  it('parses thousands without multiplying cents again', () => {
    expect(parseMoneyCents('R$ 1.234,56')).toBe(123456);
    expect(parseMoneyCents('1,234.56')).toBe(123456);
    expect(parseMoneyCents('(2,000.00)')).toBe(-200000);
  });
});
