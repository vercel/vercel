import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import getScope from '../../util/get-scope';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  normalizeDomain,
  parseResendRecords,
  planResendRecords,
  type ExistingDNSRecord,
  type ResendDNSRecord,
} from '../../util/dns/resend-records';
import { DnsConfigureTelemetryClient } from '../../util/telemetry/commands/dns/configure';
import { configureSubcommand } from './command';

interface DNSPage {
  records: ExistingDNSRecord[];
  pagination: { next: number | null };
}

export default async function configure(client: Client, argv: string[]) {
  let machine =
    client.nonInteractive ||
    !client.stdin.isTTY ||
    argv.includes('--json') ||
    argv.some(arg => arg.toLowerCase() === '--format=json') ||
    (argv.includes('--format') &&
      argv[argv.indexOf('--format') + 1]?.toLowerCase() === 'json');
  let domain: string | undefined;
  let team: string | undefined;
  let readingRemote = false;
  let attemptedRecord: ResendDNSRecord | undefined;
  const created: Array<ResendDNSRecord & { id: string }> = [];
  const inspect = () =>
    buildCommandWithGlobalFlags(client.argv, `dns ls ${domain || '<domain>'}`);
  const fail = (message: string, reason = 'dns_configure_failed') => {
    if (machine)
      client.stdout.write(
        `${JSON.stringify({ status: 'error', reason, message, domain, team, created, attemptedRecord, next: [{ command: inspect(), when: 'Inspect DNS before rerunning the same input; matching records are skipped' }] })}\n`
      );
    else {
      output.fatal(message);
      if (attemptedRecord) {
        output.print(
          `  Kept ${created.length} confirmed additions. The last request may have completed.\n  Inspect DNS before rerunning the same input:\n    ${inspect()}\n`
        );
      }
    }
    return 1;
  };

  try {
    const { args, flags } = parseArguments(
      argv,
      getFlagsSpecification(configureSubcommand.options)
    );
    const format = validateJsonOutput(flags);
    if (!format.valid) return fail(format.error, 'invalid_arguments');
    machine ||= format.jsonOutput;
    if (args.length !== 1 || !flags['--resend']) {
      return fail(
        'Provide a domain and --resend <file>. See vercel dns configure --help.',
        'invalid_arguments'
      );
    }
    domain = normalizeDomain(args[0]);
    const path = resolve(client.cwd, flags['--resend']);
    let input: unknown;
    try {
      const stat = statSync(path);
      if (!stat.isFile() || stat.size > 1024 * 1024) {
        return fail(
          'The Resend response must be a JSON file no larger than 1 MB.',
          'invalid_input'
        );
      }
      input = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return fail(
        'Failed to read the Resend JSON file. Export one domain with resend domains get <ID> --json.',
        'invalid_input'
      );
    }
    const { sendingDomain, records, excluded } = parseResendRecords(
      domain,
      input
    );
    const telemetry = new DnsConfigureTelemetryClient({
      opts: { store: client.telemetryEventStore },
    });
    telemetry.trackCliArgumentDomain(domain);
    telemetry.trackCliOptionResend(flags['--resend']);
    telemetry.trackCliFlagYes(flags['--yes']);
    telemetry.trackCliFlagDryRun(flags['--dry-run']);
    telemetry.trackCliOptionFormat(flags['--format']);
    telemetry.trackCliFlagJson(flags['--json']);

    readingRemote = true;
    ({ contextName: team } = await getScope(client));
    const existing = await listRecords(client, domain);
    readingRemote = false;
    const { missing, skipped } = planResendRecords(records, existing, domain);
    const plan = {
      domain,
      sendingDomain,
      team,
      excluded,
      missing,
      skipped: skipped.map(({ id, name, type }) => ({ id, name, type })),
    };
    if (!machine) {
      printAlignedLabel('Team', team);
      printAlignedLabel('DNS zone', domain);
      printAlignedLabel('Resend domain', sendingDomain);
      for (const record of missing) {
        printAlignedLabel(
          'Add',
          `${record.name || '@'} ${record.type} ${record.type === 'MX' ? `${record.mxPriority} ` : ''}${record.value}`
        );
      }
      printAlignedLabel('Already present', String(skipped.length));
      if (excluded.length)
        printAlignedLabel(
          'Excluded',
          `${excluded.length} receiving records (receiving is not enabled)`
        );
    }
    if (flags['--dry-run']) {
      if (machine)
        client.stdout.write(
          `${JSON.stringify({ status: 'dry_run', ...plan })}\n`
        );
      else output.print('  Dry run complete. No DNS records changed.\n');
      return 0;
    }
    if (missing.length > 0 && !flags['--yes']) {
      if (machine) {
        client.stdout.write(
          `${JSON.stringify({ status: 'action_required', reason: 'confirmation_required', message: 'Review the missing records, then pass --yes to add them.', ...plan })}\n`
        );
        return 1;
      }
      if (
        !(await client.input.confirm('Add the missing DNS records?', false))
      ) {
        output.print('  Canceled. No DNS records changed.\n');
        return 0;
      }
    }
    for (const record of missing) {
      attemptedRecord = record;
      const result = await client.fetch<{ uid: string }>(
        `/v2/domains/${encodeURIComponent(domain)}/records`,
        {
          method: 'POST',
          body: { ...record },
          retry: { retries: 0 },
          bailOn429: true,
        }
      );
      if (!result || typeof result.uid !== 'string' || !result.uid) {
        throw new Error(
          'The DNS API did not return a record ID. Inspect DNS before rerunning.'
        );
      }
      created.push({ ...record, id: result.uid });
      attemptedRecord = undefined;
    }
    const message = created.length
      ? `Added ${created.length} DNS ${created.length === 1 ? 'record' : 'records'}.`
      : records.length
        ? 'All requested Resend DNS records are already present.'
        : 'No enabled Resend DNS records to add.';
    if (machine)
      client.stdout.write(
        `${JSON.stringify({ status: 'success', message, domain, sendingDomain, team, created, skipped: plan.skipped, excluded, verification: 'not_checked' })}\n`
      );
    else {
      output.print('\n');
      printAlignedLabel('Configured', domain, { gutter: '✓' });
      for (const record of created)
        printAlignedLabel(
          'Record',
          `${record.name || '@'} ${record.type} (${record.id})`
        );
      output.print(
        `  ${message}\n  DNS propagation and Resend verification are still required.\n`
      );
    }
    return 0;
  } catch (error) {
    if (attemptedRecord) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? error.status
          : undefined;
      return fail(
        `DNS configuration stopped${typeof status === 'number' ? ` (HTTP ${status})` : ''}. Inspect DNS before rerunning; confirmed additions were kept.`
      );
    }
    if (readingRemote)
      return fail(
        'Failed to read a complete DNS record list for the selected team. No DNS records changed.'
      );
    return fail(
      error instanceof Error
        ? error.message
        : 'Failed to configure DNS records.'
    );
  }
}

async function listRecords(client: Client, domain: string) {
  const records: ExistingDNSRecord[] = [];
  const seen = new Set<number>();
  let next: number | null = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({
      limit: '100',
      ...(next !== null ? { until: String(next) } : {}),
    });
    const data: DNSPage = await client.fetch(
      `/v5/domains/${encodeURIComponent(domain)}/records?${query}`
    );
    if (
      !data ||
      !Array.isArray(data.records) ||
      !data.pagination ||
      !('next' in data.pagination) ||
      data.records.some(
        record =>
          !record ||
          typeof record.id !== 'string' ||
          typeof record.name !== 'string' ||
          typeof record.type !== 'string' ||
          typeof record.value !== 'string'
      )
    ) {
      throw new Error(
        'Failed to read a complete DNS record list. No DNS records changed.'
      );
    }
    records.push(...data.records);
    next = data.pagination.next;
    if (next === null) return records;
    if (!Number.isSafeInteger(next) || next < 0 || seen.has(next)) break;
    seen.add(next);
  }
  throw new Error('DNS pagination did not finish. No DNS records changed.');
}
