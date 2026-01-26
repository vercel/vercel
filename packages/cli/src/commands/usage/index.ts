import chalk from 'chalk';
import jsonlines from 'jsonlines';
import table from '../../util/output/table';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import elapsed from '../../util/output/elapsed';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { help } from '../help';
import { usageCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { UsageTelemetryClient } from '../../util/telemetry/commands/usage';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { isErrnoException } from '@vercel/error-utils';

interface Charge {
  ServiceName?: string;
  PricingQuantity?: number;
  EffectiveCost?: number;
  BilledCost?: number;
  ChargePeriodStart?: string;
  BillingPeriodStartDate?: string;
  ChargeDate?: string;
  Date?: string;
}

interface ServiceUsage {
  mius: number;
  effective: number;
  billed: number;
}

// LA timezone identifier
const LA_TIMEZONE = 'America/Los_Angeles';

/**
 * Get the UTC offset in hours for LA timezone at a specific date.
 * Returns 8 for PST (winter) or 7 for PDT (summer/daylight saving).
 */
function getLAOffsetHours(date: Date): number {
  // Create a formatter that outputs the timezone offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    timeZoneName: 'shortOffset',
  });

  const parts = formatter.formatToParts(date);
  const tzPart = parts.find(p => p.type === 'timeZoneName');

  if (tzPart?.value) {
    // Value will be like "GMT-8" or "GMT-7"
    const match = tzPart.value.match(/GMT([+-]\d+)/);
    if (match) {
      return -parseInt(match[1], 10); // Convert to positive offset from UTC
    }
  }

  // Default to PST (UTC-8) if parsing fails
  return 8;
}

/**
 * Convert a date string (YYYY-MM-DD) to UTC ISO string at midnight LA time.
 * For example, "2025-12-01" becomes "2025-12-01T08:00:00.000Z" (PST)
 * or "2025-06-01" becomes "2025-06-01T07:00:00.000Z" (PDT)
 */
function dateToLAMidnightUTC(dateStr: string): string {
  // Parse the date components
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create a date at midnight UTC for this calendar date
  // We'll use this to determine if DST is active in LA
  const tempDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // noon UTC to be safe

  // Get the LA offset for this date
  const offsetHours = getLAOffsetHours(tempDate);

  // Midnight LA = offsetHours:00 UTC
  const utcHour = offsetHours;

  return new Date(
    Date.UTC(year, month - 1, day, utcHour, 0, 0, 0)
  ).toISOString();
}

/**
 * Get the start of the current month at midnight LA time, in UTC ISO format.
 */
function getDefaultFromDate(): string {
  // Get current date in LA timezone
  const now = new Date();
  const laFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: LA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const laDate = laFormatter.format(now); // Format: YYYY-MM-DD

  // Extract year and month
  const [year, month] = laDate.split('-').map(Number);

  // Return first of month at midnight LA time
  return dateToLAMidnightUTC(`${year}-${String(month).padStart(2, '0')}-01`);
}

/**
 * Get the current date/time in ISO format (actual current time, not LA midnight)
 */
function getDefaultToDate(): string {
  return new Date().toISOString();
}

/**
 * Parse a date string and convert to UTC ISO format at midnight LA time.
 * Accepts YYYY-MM-DD or full ISO 8601 format.
 */
function parseDate(dateStr: string, isEndDate: boolean = false): string {
  // If it's already a full ISO string with time component, return as-is
  if (dateStr.includes('T')) {
    return dateStr;
  }

  // For end dates like "2025-12-31", we want to query up to the END of that day,
  // which means midnight LA time on the NEXT day (2026-01-01T08:00:00.000Z)
  if (isEndDate) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + 1);
    const nextDay = date.toISOString().split('T')[0];
    return dateToLAMidnightUTC(nextDay);
  }

  // For start dates, convert to midnight LA time
  return dateToLAMidnightUTC(dateStr);
}

/**
 * Format a number as currency
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

/**
 * Format MIUs with appropriate precision
 */
function formatMius(mius: number): string {
  return mius.toFixed(4);
}

export default async function usage(client: Client): Promise<number> {
  const { print, log, error, debug, spinner } = output;

  let parsedArgs = null;
  const flagsSpecification = getFlagsSpecification(usageCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new UsageTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('usage');
    print(help(usageCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  // Get date range from flags or use defaults
  // Dates are interpreted as LA timezone (America/Los_Angeles)
  const fromDate = parsedArgs.flags['--from']
    ? parseDate(parsedArgs.flags['--from'], false)
    : getDefaultFromDate();
  const toDate = parsedArgs.flags['--to']
    ? parseDate(parsedArgs.flags['--to'], true)
    : getDefaultToDate();

  telemetry.trackCliOptionFrom(parsedArgs.flags['--from']);
  telemetry.trackCliOptionTo(parsedArgs.flags['--to']);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  // Debug: show date conversion
  if (parsedArgs.flags['--from']) {
    debug(`Date conversion: ${parsedArgs.flags['--from']} -> ${fromDate}`);
  }
  if (parsedArgs.flags['--to']) {
    debug(
      `Date conversion: ${parsedArgs.flags['--to']} (end of day) -> ${toDate}`
    );
  }

  // Get the current scope (user/team context)
  let contextName: string;
  let teamId: string | undefined;

  try {
    const scope = await getScope(client);
    contextName = scope.contextName;
    teamId = scope.team?.id;
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      error(err.message);
      return 1;
    }
    throw err;
  }

  const start = Date.now();
  if (!asJson) {
    spinner(`Fetching usage data for ${chalk.bold(contextName)}`);
  }

  debug(`Fetching charges from ${fromDate} to ${toDate}`);

  // Build the API URL
  const query = new URLSearchParams({
    from: fromDate,
    to: toDate,
  });
  if (teamId) {
    query.set('teamId', teamId);
  }

  try {
    const response = await client.fetch(`/v1/billing/charges?${query}`, {
      json: false,
      useCurrentTeam: false, // We're manually setting teamId
    });

    if (!response.ok) {
      const errorText = await response.text();
      error(`Failed to fetch usage data: ${response.status} ${errorText}`);
      return 1;
    }

    // Aggregate data from the streaming response
    const services = new Map<string, ServiceUsage>();
    let grandMius = 0;
    let grandEffective = 0;
    let grandBilled = 0;
    let chargeCount = 0;

    await new Promise<void>((resolve, reject) => {
      // gzip compression is assumed
      const stream = response.body.pipe(jsonlines.parse());

      stream.on('data', (charge: Charge) => {
        chargeCount++;

        const serviceName = charge.ServiceName || 'Unknown';
        const mius = charge.PricingQuantity || 0;
        const effective = charge.EffectiveCost || 0;
        const billed = charge.BilledCost || 0;

        // Accumulate grand totals
        grandMius += mius;
        grandEffective += effective;
        grandBilled += billed;

        // Accumulate per service
        const existing = services.get(serviceName) || {
          mius: 0,
          effective: 0,
          billed: 0,
        };
        services.set(serviceName, {
          mius: existing.mius + mius,
          effective: existing.effective + effective,
          billed: existing.billed + billed,
        });
      });

      stream.on('end', resolve);
      stream.on('error', reject);
      response.body.on('error', reject);
    });

    // Sort services by MIUs descending
    const sortedServices = [...services.entries()].sort(
      (a, b) => b[1].mius - a[1].mius
    );

    if (asJson) {
      const jsonOutput = {
        period: {
          from: fromDate,
          to: toDate,
        },
        context: contextName,
        services: sortedServices.map(([name, data]) => ({
          name,
          mius: data.mius,
          effectiveCost: data.effective,
          billedCost: data.billed,
        })),
        totals: {
          mius: grandMius,
          effectiveCost: grandEffective,
          billedCost: grandBilled,
        },
        chargeCount,
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
      return 0;
    }

    // Human-readable output
    log(`Usage for ${chalk.bold(contextName)} ${elapsed(Date.now() - start)}`);
    log('');
    log(
      `${chalk.gray('Period:')} ${fromDate.substring(0, 10)} to ${toDate.substring(0, 10)}`
    );
    log(`${chalk.gray('Charges processed:')} ${chargeCount}`);
    log('');

    if (sortedServices.length === 0) {
      log('No usage data found for this period.');
      return 0;
    }

    // Build table
    const headers = ['Service', 'MIUs', 'Effective Cost', 'Billed Cost'];
    const rows = sortedServices.map(([name, data]) => [
      name,
      formatMius(data.mius),
      formatCurrency(data.effective),
      formatCurrency(data.billed),
    ]);

    // Add totals row
    rows.push([
      chalk.bold('Total'),
      chalk.bold(formatMius(grandMius)),
      chalk.bold(formatCurrency(grandEffective)),
      chalk.bold(formatCurrency(grandBilled)),
    ]);

    const tablePrint = table(
      [headers.map(h => chalk.bold(chalk.cyan(h))), ...rows],
      { hsep: 4, align: ['l', 'r', 'r', 'r'] }
    ).replace(/^/gm, '  ');

    print(`\n${tablePrint}\n\n`);

    log(
      `${chalk.gray('Amount due:')} ${chalk.bold(formatCurrency(grandBilled))}`
    );

    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}
