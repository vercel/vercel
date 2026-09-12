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
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { canPrompt } from '../../util/can-prompt';
import { validateJsonOutput } from '../../util/output-format';

function handleAgentError(
  client: Client,
  reason: string,
  message: string
): number {
  outputAgentError(client, { status: 'error', reason, message }, 1);
  output.error(message);
  return 1;
}

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

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliFlagJson(opts['--json']);
  telemetry.trackCliOptionFormat(opts['--format']);

  if (args.length !== 1 || !domainName) {
    return handleAgentError(
      client,
      AGENT_REASON.MISSING_ARGUMENTS,
      `Invalid number of arguments. Usage: ${getCommandNamePlain(
        'domains renew <domain>'
      )}`
    );
  }

  if (!isRootDomain(domainName)) {
    return handleAgentError(
      client,
      AGENT_REASON.INVALID_DOMAIN,
      `Invalid domain name "${domainName}". Use a registrable root domain (no subdomain).`
    );
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    return handleAgentError(
      client,
      AGENT_REASON.INVALID_ARGUMENTS,
      formatResult.error
    );
  }
  const asJson = formatResult.jsonOutput;

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

  if (!canPrompt(client)) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: `Renewing ${domainName} charges your account $${renewalPrice} for ${term} and requires confirmation, so it cannot be done non-interactively. Run this command in an interactive terminal to confirm the charge.`,
        userActionRequired: true,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'domains renew <domain>'
            ),
            when: 'user runs this command in an interactive terminal',
          },
        ],
      },
      1
    );
    output.error(
      'This command must be run interactively to confirm renewing (charging for) this domain.'
    );
    return 1;
  }

  output.log(
    `An email with the invoice and transaction details will be sent to you after renewal.`
  );
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

  const renewStamp = stamp();
  output.spinner(`Renewing ${domainName}`);

  let order;
  try {
    order = await renewDomain(client, domainName, renewalPrice, years);
  } catch (err: unknown) {
    output.stopSpinner();
    if (ERRORS.isAPIError(err)) {
      const codeMessages: Record<string, string> = {
        expected_price_mismatch: `The renewal price for ${param(domainName)} changed. Run ${getCommandName(`domains renew ${domainName}`)} again to see the new price.`,
        domain_not_registered: `The domain ${param(domainName)} is not registered with Vercel.`,
        domain_not_found: `Domain ${param(domainName)} not found under ${chalk.bold(contextName)}.`,
        tld_not_supported: `The TLD for domain name ${param(domainName)} is not supported.`,
        forbidden: `You don't have permission to renew ${param(domainName)} under ${chalk.bold(contextName)}.`,
      };
      const known = codeMessages[err.code];
      if (known || err.status < 500) {
        output.error(known ?? (err.serverMessage || err.message));
        return 1;
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
    output.warn(
      `Renewal for ${param(domainName)} was submitted but is still processing. ` +
        'Check https://vercel.com/dashboard/domains for the final status.'
    );
    return 0;
  }

  if (order.error?.code === 'payment-failed') {
    output.error('Your card was declined.');
    return 1;
  }

  if (order.status !== 'completed') {
    output.error(
      `An unexpected error happened while renewing ${param(domainName)}.`
    );
    return 1;
  }

  const renewedItem = order.domains.find(d => d.domainName === domainName);
  if (renewedItem?.status !== 'completed') {
    output.error(
      renewedItem?.status === 'refunded' ||
        renewedItem?.status === 'refund-failed'
        ? `Renewal for ${param(domainName)} failed and the charge was refunded.`
        : `Renewal for ${param(domainName)} did not complete.`
    );
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          domain: domainName,
          term,
          years,
          price: renewalPrice,
          orderId: order.orderId,
          message: `Domain ${domainName} renewed.`,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(`Domain ${param(domainName)} renewed ${renewStamp()}`);
  return 0;
}
