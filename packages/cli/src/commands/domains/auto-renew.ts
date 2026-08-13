import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import getScope from '../../util/get-scope';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';
import updateAutoRenew from '../../util/domains/update-auto-renew';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsAutoRenewTelemetryClient } from '../../util/telemetry/commands/domains/auto-renew';
import type Client from '../../util/client';
import { autoRenewSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function autoRenew(client: Client, argv: string[]) {
  const telemetry = new DomainsAutoRenewTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(autoRenewSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;
  const [domainName, state] = args;

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliArgumentState(state);

  if (args.length !== 2 || !domainName || !state) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains auto-renew <domain> <on|off>')}`
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

  if (state !== 'on' && state !== 'off') {
    output.error(
      `Invalid state "${state}". Expected ${chalk.bold('on')} or ${chalk.bold(
        'off'
      )}.`
    );
    return 1;
  }

  const enabled = state === 'on';
  const { contextName } = await getScope(client);

  output.spinner(`Turning automatic renewal ${state} for ${domainName}`);

  try {
    await updateAutoRenew(client, domainName, enabled);
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
        case 'domain_not_renewable':
          output.error(
            `The domain ${param(domainName)} cannot be renewed, so automatic renewal can't be changed.`
          );
          return 1;
        case 'domain_already_renewing':
          output.error(
            `The domain ${param(domainName)} is already renewing, so automatic renewal can't be changed right now.`
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
      'An unexpected error occurred while updating automatic renewal. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }

  output.stopSpinner();
  output.success(
    enabled
      ? `Automatic renewal turned on for ${param(domainName)}`
      : `Automatic renewal turned off for ${param(domainName)}`
  );
  return 0;
}
