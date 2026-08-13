import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';
import formatNSTable from '../../util/format-ns-table';
import updateNameservers from '../../util/domains/update-nameservers';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { DomainsNameserversTelemetryClient } from '../../util/telemetry/commands/domains/nameservers';
import type Client from '../../util/client';
import { nameserversSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

function parseNameserverList(value: string): string[] {
  return value
    .split(',')
    .map(ns => ns.trim())
    .filter(ns => ns.length > 0);
}

export default async function nameservers(client: Client, argv: string[]) {
  const telemetry = new DomainsNameserversTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    nameserversSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [domainName] = args;
  const setValue = opts['--set'];
  const restore = Boolean(opts['--restore']);
  const yes = Boolean(opts['--yes']);

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionSet(setValue);
  telemetry.trackCliFlagRestore(opts['--restore']);
  telemetry.trackCliFlagYes(opts['--yes']);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  if (args.length !== 1 || !domainName) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains nameservers <domain>')}`
      )}`
    );
    return 1;
  }

  if (!isRootDomain(domainName)) {
    output.error(
      `Invalid domain name "${domainName}". Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  if (setValue !== undefined && restore) {
    output.error(
      `Cannot use ${chalk.bold('--set')} and ${chalk.bold(
        '--restore'
      )} together.`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  // Mutation path: change or restore the nameservers.
  if (setValue !== undefined || restore) {
    const nextNameservers = restore ? [] : parseNameserverList(setValue ?? '');

    if (!restore && nextNameservers.length === 0) {
      output.error(
        `No nameservers provided. Pass a comma-separated list, e.g. ${chalk.cyan(
          `${getCommandName(
            'domains nameservers ' +
              domainName +
              ' --set ns1.example.com,ns2.example.com'
          )}`
        )}`
      );
      return 1;
    }

    if (!yes) {
      const question = restore
        ? `Restore Vercel's default nameservers for ${param(domainName)}?`
        : `Set nameservers for ${param(domainName)} to ${chalk.bold(
            nextNameservers.join(', ')
          )}?`;
      output.warn(
        'Changing nameservers can interrupt DNS resolution for this domain until the new records propagate.'
      );
      const confirmed = await client.input.confirm(question, false);
      if (!confirmed) {
        output.log('Canceled');
        return 0;
      }
    }

    output.spinner(`Updating nameservers for ${domainName}`);
    try {
      await updateNameservers(client, domainName, nextNameservers);
    } catch (err: unknown) {
      output.stopSpinner();
      if (ERRORS.isAPIError(err)) {
        switch (err.code) {
          case 'domain_not_registered':
            output.error(
              `The domain ${param(domainName)} is not registered with Vercel.`
            );
            return 1;
          case 'domain_not_found':
            output.error(
              `Domain ${param(domainName)} not found under ${chalk.bold(
                contextName
              )}.`
            );
            return 1;
          case 'forbidden':
            output.error(
              `You don't have permission to update ${param(
                domainName
              )} under ${chalk.bold(contextName)}.`
            );
            return 1;
          default:
            if (err.status < 500) {
              output.error(err.serverMessage || err.message);
              return 1;
            }
        }
      }
      output.error(
        'An unexpected error occurred while updating nameservers. Please try again later.'
      );
      output.debug(`Server response: ${errorToString(err)}`);
      return 1;
    }

    output.stopSpinner();
    output.success(
      restore
        ? `Restored Vercel's default nameservers for ${param(domainName)}`
        : `Nameservers for ${param(domainName)} set to ${chalk.bold(
            nextNameservers.join(', ')
          )}`
    );
    return 0;
  }

  // View path: show the current nameservers.
  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const domain = await getDomainByName(client, contextName, domainName, {
    ignoreWait: asJson,
  });

  if (domain instanceof ERRORS.DomainNotFound) {
    if (asJson) {
      output.error(`Domain ${domainName} not found under ${contextName}.`);
      return 1;
    }
    output.prettyError(domain);
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }

  if (domain instanceof ERRORS.DomainPermissionDenied) {
    output.prettyError(domain);
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          domain: domain.name,
          nameservers: domain.nameservers,
          intendedNameservers: domain.intendedNameservers,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.log(
    `Nameservers for ${param(domainName)} under ${chalk.bold(contextName)}`
  );
  output.print('\n');
  output.print(
    `${formatNSTable(domain.intendedNameservers, domain.nameservers, {
      extraSpace: '  ',
    })}\n`
  );
  output.print('\n');
  return 0;
}
