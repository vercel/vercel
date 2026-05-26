import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { checkSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import getDomainStatus from '../../util/domains/get-domain-status';
import { isAPIError } from '../../util/errors-ts';
import isRootDomain from '../../util/is-root-domain';
import { getCommandName } from '../../util/pkg-name';
import param from '../../util/output/param';

export default async function check(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(checkSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const domain = args[0];
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  if (!domain) {
    output.error('Missing domain name. Usage: `vercel domains check <domain>`');
    return 1;
  }

  if (!isRootDomain(domain)) {
    output.error(
      `Invalid domain name ${param(domain)}. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  try {
    const { available } = await getDomainStatus(client, domain);

    if (formatResult.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ domain, available: Boolean(available) }, null, 2)}\n`
      );
      return 0;
    }

    output.log(
      `The domain ${param(domain)} is ${chalk.underline(
        available ? 'available' : 'unavailable'
      )}.`
    );
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      const message = error.serverMessage || `API error (${error.status})`;
      if (formatResult.jsonOutput) {
        client.stdout.write(
          `${JSON.stringify(
            { error: error.code || 'api_error', message },
            null,
            2
          )}\n`
        );
      } else {
        output.error(message);
      }
      return 1;
    }

    printError(error);
    return 1;
  }
}
