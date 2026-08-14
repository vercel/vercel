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

type BulkDomainAvailabilityResponse = {
  results: {
    domain: string;
    available: boolean;
  }[];
};

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
  const domains = args;
  const hasMultipleInputDomains = domains.length > 1;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  if (domains.length === 0) {
    output.error('Missing domain name. Usage: `vercel domains check <domain>`');
    return 1;
  }

  if (domains.length > 50) {
    output.error(
      'Too many domains. You can check up to 50 domains per request.'
    );
    return 1;
  }

  const invalidDomains = domains.filter(domain => !isRootDomain(domain));
  if (invalidDomains.length > 0) {
    output.error(
      `Invalid domain name(s): ${invalidDomains
        .map(domain => param(domain))
        .join(', ')}. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  try {
    const results =
      domains.length === 1
        ? [
            {
              domain: domains[0],
              available: (await getDomainStatus(client, domains[0])).available,
            },
          ]
        : (
            await client.fetch<BulkDomainAvailabilityResponse>(
              '/v1/registrar/domains/availability',
              {
                method: 'POST',
                body: {
                  domains,
                },
              }
            )
          ).results;

    if (formatResult.jsonOutput) {
      if (!hasMultipleInputDomains && results.length === 1) {
        client.stdout.write(
          `${JSON.stringify(
            {
              domain: results[0].domain,
              available: Boolean(results[0].available),
            },
            null,
            2
          )}\n`
        );
      } else {
        client.stdout.write(
          `${JSON.stringify(
            {
              results: results.map(result => ({
                domain: result.domain,
                available: Boolean(result.available),
              })),
            },
            null,
            2
          )}\n`
        );
      }
      return 0;
    }

    for (const result of results) {
      output.log(
        `The domain ${param(result.domain)} is ${chalk.underline(
          result.available ? 'available' : 'unavailable'
        )}.`
      );
    }
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
