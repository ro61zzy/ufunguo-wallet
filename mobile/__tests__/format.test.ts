import {
  formatBtc,
  formatSats,
  formatSignedSats,
  parseBtcInput,
  parseSatsInput,
  truncateMiddle,
} from '../src/utils/format';

describe('satoshi formatting', () => {
  it('groups digits without floating point', () => {
    expect(formatSats(74_999_718)).toBe('74,999,718 sats');
    expect(formatSats(0)).toBe('0 sats');
    expect(formatSats(-25_000_282)).toBe('-25,000,282 sats');
  });

  it('formats BTC with exactly eight decimals', () => {
    expect(formatBtc(1)).toBe('0.00000001 BTC');
    expect(formatBtc(100_000_000)).toBe('1.00000000 BTC');
    expect(formatBtc(2_100_000_000_000_000)).toBe('21000000.00000000 BTC');
    expect(formatBtc(-150_000_000, { trim: true })).toBe('-1.5 BTC');
    expect(formatBtc(100_000_000, { trim: true })).toBe('1 BTC');
  });

  it('adds a plus sign for incoming amounts', () => {
    expect(formatSignedSats(1000)).toBe('+1,000 sats');
    expect(formatSignedSats(-1000)).toBe('-1,000 sats');
  });
});

describe('amount parsing', () => {
  it('accepts whole satoshis only', () => {
    expect(parseSatsInput('25000')).toBe(25000);
    expect(parseSatsInput('25,000')).toBe(25000);
    expect(parseSatsInput('2.5')).toBeNull();
    expect(parseSatsInput('-5')).toBeNull();
    expect(parseSatsInput('')).toBeNull();
  });

  it('converts BTC strings to sats exactly', () => {
    expect(parseBtcInput('0.1')).toBe(10_000_000);
    expect(parseBtcInput('0.00000001')).toBe(1);
    expect(parseBtcInput('1')).toBe(100_000_000);
    expect(parseBtcInput('.5')).toBe(50_000_000);
    // 0.1 + 0.2 style float errors cannot occur.
    expect(parseBtcInput('0.3')).toBe(30_000_000);
    expect(parseBtcInput('0.000000001')).toBeNull();
    expect(parseBtcInput('abc')).toBeNull();
    expect(parseBtcInput('.')).toBeNull();
  });
});

it('truncates long identifiers in the middle', () => {
  const txid = 'a'.repeat(30) + 'b'.repeat(34);
  expect(truncateMiddle(txid, 4, 4)).toBe('aaaa…bbbb');
  expect(truncateMiddle('short')).toBe('short');
});
