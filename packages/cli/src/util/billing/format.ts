import { DateTime } from 'luxon';

// Vercel billing periods are aligned to LA (Pacific) time
export const LA_TIMEZONE = 'America/Los_Angeles';

export function dateToLAMidnightUTC(dateStr: string): string {
  const laDateTime = DateTime.fromISO(dateStr, { zone: LA_TIMEZONE }).startOf(
    'day'
  );

  return laDateTime.toUTC().toISO() ?? '';
}

export function getDefaultFromDate(): string {
  const nowLA = DateTime.now().setZone(LA_TIMEZONE);
  const startOfMonth = nowLA.startOf('month');
  return startOfMonth.toUTC().toISO() ?? '';
}

export function getDefaultToDate(): string {
  return DateTime.utc().toISO() ?? '';
}

export function parseBillingDate(
  dateStr: string,
  isEndDate: boolean = false
): string {
  if (dateStr.includes('T')) {
    return dateStr;
  }

  let laDateTime = DateTime.fromISO(dateStr, { zone: LA_TIMEZONE }).startOf(
    'day'
  );

  if (isEndDate) {
    laDateTime = laDateTime.plus({ days: 1 });
  }

  return laDateTime.toUTC().toISO() ?? '';
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

export function formatQuantity(quantity: number, unit: string): string {
  if (unit === 'USD') {
    return `$${quantity.toFixed(4)}`;
  }
  return quantity.toFixed(4);
}

export function extractDatePortion(isoString: string): string {
  return isoString.substring(0, 10);
}
