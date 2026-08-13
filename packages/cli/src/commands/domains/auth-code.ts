import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import fetchAuthCode from '../../util/domains/fetch-auth-code';
import getScope from '../../util/get-scope';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsAuthCodeTelemetryClient } from '../../util/telemetry/commands/domains/auth-code';
import type Client from '../../util/client';
import { authCodeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function authCode(client: Client, argv: string[]) {
  const telemetry = new DomainsAuthCodeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(authCodeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;
  const [domainName] = args;

  telemetry.trackCliArgumentDomain(domainName);

  if (args.length !== 1 || !domainName) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains auth-code <domain>')}`
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

  const { contextName } = await getScope(client);

  output.spinner(`Fetching auth code for ${domainName}`);

  let code: string;
  try {
    code = await fetchAuthCode(client, domainName);
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
        case 'domain_cannot_be_transfered_out_until':
          output.error(
            err.serverMessage ||
              `The domain ${param(domainName)} cannot be transferred out yet.`
          );
          return 1;
        case 'forbidden':
          output.error(
            `You don't have permission to read the auth code for ${param(
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
      'An unexpected error occurred while fetching the auth code. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }

  output.stopSpinner();

  // The auth code is a sensitive secret. Keep human context and the warning on
  // stderr so stdout stays a clean, pipeable single line containing only the code.
  output.warn(
    `This is a sensitive transfer-out auth code for ${param(domainName)}. ` +
      'Anyone with it can transfer the domain away from Vercel. Do not share or log it.'
  );
  client.stdout.write(`${code}\n`);

  return 0;
}
