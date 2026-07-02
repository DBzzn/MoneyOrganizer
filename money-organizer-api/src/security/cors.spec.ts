import {
  createCorsOriginValidator,
  isAllowedCorsOrigin,
  parseCsv,
} from './cors';

describe('CORS allowlist', () => {
  it('allows configured origins without reflecting arbitrary origins', () => {
    const options = {
      configuredOrigins: ['https://app.example.test'],
      allowTailscaleOrigins: false,
    };

    expect(isAllowedCorsOrigin('https://app.example.test', options)).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.example.test', options)).toBe(false);
  });

  it('allows requests without an Origin header', () => {
    expect(
      isAllowedCorsOrigin(undefined, {
        configuredOrigins: ['https://app.example.test'],
        allowTailscaleOrigins: false,
      }),
    ).toBe(true);
  });

  it('parses comma-separated configured origins', () => {
    expect(parseCsv(' https://a.example.test,https://b.example.test ')).toEqual([
      'https://a.example.test',
      'https://b.example.test',
    ]);
  });

  it('passes only allowlisted origins through the CORS callback', () => {
    const validator = createCorsOriginValidator({
      configuredOrigins: ['https://app.example.test'],
      allowTailscaleOrigins: false,
    });
    const callback = jest.fn();

    validator('https://evil.example.test', callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
