import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { DomainNotFound, InvalidDomain } from '../../util/errors-ts';
import stamp from '../../util/output/stamp';
import importZonefile from '../../util/dns/import-zonefile';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { DnsImportTelemetryClient } from '../../util/telemetry/commands/dns/import';
import { importSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';

function withGlobalFlags(client: Client, commandTemplate: string): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

export default async function importZone(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(importSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: err instanceof Error ? err.message : String(err),
        },
        1
      );
    }
    printError(err);
    return 1;
  }
  const { args } = parsedArgs;
  const { telemetryEventStore } = client;
  const { contextName } = await getScope(client);
  const telemetry = new DnsImportTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  if (args.length !== 2) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(client, 'dns import <domain> <zonefile>');
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_arguments',
          action: 'missing_arguments',
          message: `Invalid number of arguments. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to import a zone file',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns import <domain> <zonefile>')}`
      )}`
    );
    return 1;
  }

  const addStamp = stamp();
  const [domain, zonefilePath] = args;
  telemetry.trackCliArgumentDomain(domain);
  telemetry.trackCliArgumentZonefile(zonefilePath);

  const recordIds = await importZonefile(
    client,
    contextName,
    domain,
    zonefilePath
  );
  if (recordIds instanceof DomainNotFound) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'domain_not_found',
          message: `The domain ${domain} can't be found under ${contextName}.`,
          next: [
            {
              command: withGlobalFlags(client, 'dns ls'),
              when: 'to list DNS records for your scope',
            },
          ],
        },
        1
      );
    }
    output.error(
      `The domain ${domain} can't be found under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }

  if (recordIds instanceof InvalidDomain) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_domain',
          message: `The domain ${domain} doesn't match the one found in the zone file.`,
        },
        1
      );
    }
    output.error(
      `The domain ${domain} doesn't match with the one found in the Zone file ${chalk.gray(
        addStamp()
      )}`
    );
    return 1;
  }

  output.success(
    `${recordIds.length} DNS records for domain ${chalk.bold(
      domain
    )} created under ${chalk.bold(contextName)} ${chalk.gray(addStamp())}`
  );
  return 0;
}
