import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import getDomainPrice from '../../util/domains/get-domain-price';
import getScope from '../../util/get-scope';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';
import renewDomain from '../../util/domains/renew-domain';
import stamp from '../../util/output/stamp';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsRenewTelemetryClient } from '../../util/telemetry/commands/domains/renew';
import type Client from '../../util/client';
import { renewSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';

const VERCEL_DOMAINS_URL = 'https://vercel.com/dashboard/domains';

export default async function renew(client: Client, argv: string[]) {
  const telemetry = new DomainsRenewTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(renewSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [domainName] = args;
  const yes = Boolean(opts['--yes']);

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliFlagYes(opts['--yes']);

  if (args.length !== 1 || !domainName) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: `Invalid number of arguments. Usage: ${getCommandNamePlain(
            'domains renew <domain>'
          )}`,
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains renew <domain>')}`
      )}`
    );
    return 1;
  }

  if (!isRootDomain(domainName)) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_DOMAIN,
          message: `Invalid domain name '${domainName}'. Use a registrable root domain (no subdomain).`,
        },
        1
      );
    }
    output.error(
      `Invalid domain name "${domainName}". Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  const domainPrice = await getDomainPrice(client, domainName);
  if (domainPrice instanceof Error) {
    output.prettyError(domainPrice);
    return 1;
  }

  const { years, renewalPrice } = domainPrice;
  if (renewalPrice === null) {
    output.error(
      `Renewal price for ${param(domainName)} is not available. This domain may not be renewable.`
    );
    return 1;
  }

  const term = `${years}yr${years > 1 ? 's' : ''}`;

  if (!yes) {
    // Renewal charges the account, so confirmation is required.
    if (client.nonInteractive) {
      const flags = getGlobalFlagsFromArgs(client.argv.slice(2));
      const interactiveCmd = getCommandNamePlain(
        `domains renew ${domainName} ${flags
          .filter(f => f !== '--non-interactive')
          .join(' ')}`.trim()
      );
      const yesCmd = getCommandNamePlain(
        `domains renew ${domainName} --yes ${flags.join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.CONFIRMATION_REQUIRED,
          message:
            `Renewing ${domainName} charges your account $${renewalPrice} for ${term}. ` +
            'Renewal cannot be confirmed non-interactively without --yes. ' +
            'Agents must not renew domains on a user’s behalf without explicit consent.',
          userActionRequired: true,
          next: [
            {
              command: yesCmd,
              when: 'the user has explicitly approved paying the renewal price',
            },
            {
              command: interactiveCmd,
              when: 'the user runs this command interactively to confirm the price',
            },
          ],
        },
        1
      );
      return 1;
    }

    const confirmed = await client.input.confirm(
      `Renew ${param(domainName)} now for ${chalk.bold(
        `$${renewalPrice}`
      )} (${term})?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const renewStamp = stamp();
  output.spinner(`Renewing ${domainName}`);

  let order;
  try {
    order = await renewDomain(client, domainName, renewalPrice, years);
  } catch (err: unknown) {
    output.stopSpinner();
    if (ERRORS.isAPIError(err)) {
      switch (err.code) {
        case 'expected_price_mismatch':
          output.error(
            `The renewal price for ${param(domainName)} changed. Run ${getCommandName(
              `domains renew ${domainName}`
            )} again to see the new price.`
          );
          return 1;
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
        case 'tld_not_supported':
          output.error(
            `The TLD for domain name ${param(domainName)} is not supported.`
          );
          return 1;
        case 'forbidden':
          output.error(
            `You don't have permission to renew ${param(
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
      'An unexpected error occurred while renewing your domain. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }

  output.stopSpinner();

  if (order === null) {
    // Timed out waiting for the order to settle; the renewal may still complete.
    output.warn(
      `Renewal for ${param(domainName)} was submitted but is still processing. ` +
        `Check ${VERCEL_DOMAINS_URL} for the final status.`
    );
    return 0;
  }

  if (order.error?.code === 'payment_failed') {
    output.error('Your card was declined.');
    return 1;
  }

  if (order.status !== 'completed') {
    output.error(
      `An unexpected error happened while renewing ${param(domainName)}.`
    );
    return 1;
  }

  output.success(`Domain ${param(domainName)} renewed ${renewStamp()}`);
  return 0;
}
