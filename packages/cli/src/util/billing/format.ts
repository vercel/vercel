import { DateTime } from 'luxon';

// Vercel billing periods are aligned to LA (Pacific) time
export const LA_TIMEZONE = 'America/Los_Angeles';

function toISOOrThrow(dt: DateTime): string {
  if (!dt.isValid) {
    throw new Error(`Invalid DateTime: ${dt.invalidReason}`);
  }
  const iso = dt.toISO();
  if (!iso) {
    throw new Error(`Failed to convert DateTime to ISO`);
  }
  return iso;
}

function getDefaultFromDateTime(): DateTime {
  return DateTime.now().setZone(LA_TIMEZONE).startOf('month');
}

function getDefaultToDateTime(): DateTime {
  return DateTime.utc();
}

export function getDefaultFromDate(): string {
  const dt = getDefaultFromDateTime();
  return toISOOrThrow(dt.toUTC());
}

export function getDefaultToDate(): string {
  const dt = getDefaultToDateTime();
  return toISOOrThrow(dt.toUTC());
}

export function getDefaultFromDateDisplay(): string {
  const dt = getDefaultFromDateTime();
  return dt.toFormat('yyyy-MM-dd');
}

export function getDefaultToDateDisplay(): string {
  const dt = getDefaultToDateTime();
  return dt.toFormat('yyyy-MM-dd');
}

export function parseBillingDate(
  dateStr: string,
  isEndDate: boolean = false
): string {
  if (dateStr.includes('T')) {
    const dt = DateTime.fromISO(dateStr);
    if (!dt.isValid) {
      throw new Error(
        `Invalid date: "${dateStr}". Expected ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)`
      );
    }
    return dateStr;
  }

  // Validate YYYY-MM-DD format
  const laDateTime = DateTime.fromISO(dateStr, { zone: LA_TIMEZONE }).startOf(
    'day'
  );

  if (!laDateTime.isValid) {
    throw new Error(
      `Invalid date: "${dateStr}". Expected ISO 8601 format (YYYY-MM-DD)`
    );
  }

  const finalDateTime = isEndDate ? laDateTime.plus({ days: 1 }) : laDateTime;
  return toISOOrThrow(finalDateTime.toUTC());
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
