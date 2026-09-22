export interface CaptureWindow {
  startDate: string;
  endDate: string;
  timeZone: string;
  startUtc: string;
  endUtcExclusive: string;
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** Return today's civil date in the selected capture-area time zone. */
export function todayInTimeZone(timeZone: string, instant = Date.now()): string {
  if (!validTimeZone(timeZone)) return new Date(instant).toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function dateNumber(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid capture date');
  const n = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== date)
    throw new Error('Invalid capture date');
  return n;
}

/** Find the first instant of a civil date, without assuming a 24-hour DST day. */
function dayStart(date: string, timeZone: string) {
  const n = dateNumber(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDate = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  let lo = n - 36 * 3600000,
    hi = n + 36 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((hi + lo) / 2);
    if (localDate(mid) < date) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function makeCaptureWindow(
  startDate: string,
  endDate: string,
  timeZone: string,
): CaptureWindow {
  if (!validTimeZone(timeZone)) throw new Error('Invalid time zone');
  const start = dateNumber(startDate),
    end = dateNumber(endDate);
  if (end < start) throw new Error('Capture end date must not precede start date');
  const nextDate = new Date(end + 86400000).toISOString().slice(0, 10);
  const startUtc = dayStart(startDate, timeZone),
    endUtc = dayStart(nextDate, timeZone);
  if (
    dayStart(new Date(start + 86400000).toISOString().slice(0, 10), timeZone) === startUtc ||
    dayStart(endDate, timeZone) === endUtc
  )
    throw new Error('Capture date does not exist in this time zone');
  return {
    startDate,
    endDate,
    timeZone,
    startUtc: new Date(startUtc).toISOString(),
    endUtcExclusive: new Date(endUtc).toISOString(),
  };
}
