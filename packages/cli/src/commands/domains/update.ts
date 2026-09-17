import { domainToASCII } from 'url';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import {
  validateJsonOutput,
  wantsMachineReadableOutput,
} from '../../util/output-format';
import { canPrompt } from '../../util/can-prompt';
import isRootDomain from '../../util/is-root-domain';
import getScope from '../../util/get-scope';
import { isAPIError } from '../../util/errors-ts';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { DomainsUpdateTelemetryClient } from '../../util/telemetry/commands/domains/update';
import { updateSubcommand } from './command';

export default async function update(client: Client, argv: string[]) {
  let asJson =
    !canPrompt(client) || wantsMachineReadableOutput('domains', argv);
  let domain: string | undefined;

  function fail(reason: string, message: string) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ status: 'error', reason, domain, message }, null, 2)}\n`
      );
    } else {
      output.error(message);
    }
    return 1;
  }

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(updateSubcommand.options)
    );
  } catch (error) {
    return fail(
      'invalid_arguments',
      error instanceof Error ? error.message : String(error)
    );
  }

  const { args, flags } = parsedArgs;
  const telemetry = new DomainsUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackCliArgumentDomain(args[0]);
  telemetry.trackCliOptionZone(flags['--zone']);
  telemetry.trackCliOptionEchMode(flags['--ech-mode']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const format = validateJsonOutput(flags);
  if (!format.valid) return fail('invalid_arguments', format.error);
  asJson = format.jsonOutput || !canPrompt(client);

  if (args.length !== 1) {
    return fail(
      'invalid_arguments',
      'Provide one apex domain. Usage: vercel domains update <domain> --zone <true|false> or --ech-mode <auto|disabled>.'
    );
  }

  const input = args[0];
  domain = domainToASCII(input).toLowerCase();
  // Reject URLs and path/query fragments before URL normalization can discard them.
  if (
    !/^[\p{L}\p{M}\p{N}.-]+$/u.test(input) ||
    domain.length > 253 ||
    !isRootDomain(domain) ||
    !domain
      .split('.')
      .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    return fail(
      'invalid_domain',
      'Provide an apex domain, such as example.com, without a URL, path, or subdomain.'
    );
  }

  const zone = flags['--zone'];
  const echMode = flags['--ech-mode'];
  if (zone === undefined && echMode === undefined) {
    return fail(
      'invalid_arguments',
      'Specify --zone <true|false> or --ech-mode <auto|disabled>.'
    );
  }
  if (zone !== undefined && zone !== 'true' && zone !== 'false') {
    return fail('invalid_arguments', 'The --zone value must be true or false.');
  }
  if (echMode !== undefined && echMode !== 'auto' && echMode !== 'disabled') {
    return fail(
      'invalid_arguments',
      'The --ech-mode value must be auto or disabled.'
    );
  }
  if (zone === 'false' && echMode !== undefined) {
    return fail(
      'invalid_arguments',
      'Encrypted Client Hello settings require a domain that uses Vercel DNS. Omit --ech-mode when setting --zone false.'
    );
  }

  try {
    const { contextName, team } = await getScope(client);
    if (!asJson) output.spinner(`Updating ${domain} under ${contextName}`);
    const result = await client.fetch<{
      zone: boolean;
      echMode: 'auto' | 'disabled' | 'enabled';
    }>(`/v3/domains/${encodeURIComponent(domain)}`, {
      method: 'PATCH',
      body: {
        ...(zone === undefined ? {} : { zone: zone === 'true' }),
        ...(echMode === undefined ? {} : { echMode }),
      },
      retry: { retries: 0 },
      bailOn429: true,
    });
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ status: 'ok', domain, team: team?.slug ?? null, zone: result.zone, echMode: result.echMode }, null, 2)}\n`
      );
    } else {
      output.success(`Updated ${domain} under ${contextName}`);
      printAlignedLabel('DNS Zone', String(result.zone));
      printAlignedLabel('ECH Mode', result.echMode);
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    return fail(
      isAPIError(error) ? error.code : 'api_error',
      error instanceof Error
        ? error.message
        : 'Could not update the domain settings.'
    );
  }
}
