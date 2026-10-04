// Presentation-only helpers. Amounts arrive from Rust as integer satoshis;
// these functions only turn them into strings (and parse user-typed strings
// back into integers) without floating-point arithmetic.

const SATS_PER_BTC = 100_000_000;

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatSats(sats: number): string {
  const sign = sats < 0 ? '-' : '';
  return `${sign}${groupDigits(Math.abs(Math.trunc(sats)).toString())} sats`;
}

export function formatBtc(sats: number, { trim = false } = {}): string {
  const sign = sats < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(sats));
  const whole = Math.floor(absolute / SATS_PER_BTC);
  let fraction = (absolute % SATS_PER_BTC).toString().padStart(8, '0');
  if (trim) {
    fraction = fraction.replace(/0+$/, '');
  }
  return `${sign}${whole}${fraction ? `.${fraction}` : ''} BTC`;
}

export function formatSignedSats(sats: number): string {
  return sats > 0 ? `+${formatSats(sats)}` : formatSats(sats);
}

/** Parses a whole-number satoshi string. Returns null when invalid. */
export function parseSatsInput(input: string): number | null {
  const cleaned = input.replace(/[,_\s]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/** Parses a decimal BTC string into satoshis using string arithmetic. */
export function parseBtcInput(input: string): number | null {
  const cleaned = input.replace(/[,_\s]/g, '');
  const match = /^(\d*)(?:\.(\d{0,8}))?$/.exec(cleaned);
  if (!match || cleaned === '' || cleaned === '.') {
    return null;
  }
  const whole = match[1] === '' ? '0' : match[1];
  const fraction = (match[2] ?? '').padEnd(8, '0');
  const value = Number(`${whole}${fraction}`);
  return Number.isSafeInteger(value) ? value : null;
}

export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatTimestamp(unixSeconds: number | null): string | null {
  if (unixSeconds === null) {
    return null;
  }
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString();
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}
