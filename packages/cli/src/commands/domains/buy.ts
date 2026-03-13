import chalk from 'chalk';
import { parse } from 'tldts';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import getDomainPrice from '../../util/domains/get-domain-price';
import getDomainStatus from '../../util/domains/get-domain-status';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import purchaseDomain from '../../util/domains/purchase-domain';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsBuyTelemetryClient } from '../../util/telemetry/commands/domains/buy';
import type Client from '../../util/client';
import { buySubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import collectContactInformation from '../../util/domains/collect-contact-information';
import { outputAgentError } from '../../util/agent-output';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import { getCommandNamePlain } from '../../util/pkg-name';

const VERCEL_DOMAINS_URL = 'https://vercel.com/dashboard/domains';

function openUrlInBrowserCommand(url: string): string {
  if (process.platform === 'win32') return `start ${url}`;
  if (process.platform === 'darwin') return `open '${url}'`;
  return `xdg-open '${url}'`;
}

export default async function buy(client: Client, argv: string[]) {
  const telemetry = new DomainsBuyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(buySubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;

  const [domainName] = args;
  const skipConfirmation = !!process.env.CI;
  telemetry.trackCliArgumentDomain(domainName);

  if (!domainName) {
    if (client.nonInteractive) {
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
      const cmd = getCommandNamePlain(
        `domains buy <domain> ${flags.join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message: `Missing domain name. This command cannot be completed non-interactively without a domain. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'user must run interactively; agents must not purchase on behalf of a user',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Missing domain name. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  // Domain purchase requires confirmation and contact details—never run by agents.
  if (client.nonInteractive) {
    const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
    const interactiveCmd = getCommandNamePlain(
      `domains buy ${domainName} ${flags.filter(f => f !== '--non-interactive').join(' ')}`.trim()
    );
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'purchase_requires_user',
        message:
          'Domain purchase cannot be performed non-interactively. Agents must not purchase domains on behalf of a user. ' +
          'The user must run this command interactively in a terminal to confirm price, auto-renew, and provide registrant contact details. ' +
          'Alternatively the user can complete purchase in the Vercel dashboard.',
        next: [
          {
            command: openUrlInBrowserCommand(VERCEL_DOMAINS_URL),
            when: 'user opens Domains in the browser to purchase',
          },
          {
            command: interactiveCmd,
            when: 'user runs this command interactively (remove --non-interactive)',
          },
        ],
      },
      1
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  const parsedDomain = parse(domainName);

  const { domain: rootDomain, subdomain } = parsedDomain;
  if (subdomain || !rootDomain) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_domain',
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

  const availableStamp = stamp();
  const domainPrice = await getDomainPrice(client, domainName);

  if (domainPrice instanceof Error) {
    output.prettyError(domainPrice);
    return 1;
  }

  const { years, purchasePrice, renewalPrice } = domainPrice;

  if (purchasePrice === null || renewalPrice === null) {
    output.error('Domain price not found');
    return 1;
  }

  if (!(await getDomainStatus(client, domainName)).available) {
    output.error(
      `The domain ${param(domainName)} is ${chalk.underline(
        'unavailable'
      )}! ${availableStamp()}`
    );
    return 1;
  }

  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to buy under ${chalk.bold(contextName)}! ${availableStamp()}`
  );

  if (skipConfirmation) {
    output.error(
      'Domain purchase in CI mode is not supported. Please run this command interactively to provide contact information.'
    );
    return 1;
  }

  if (
    !(await client.input.confirm(
      `Buy now for ${chalk.bold(`$${purchasePrice}`)} (${`${years}yr${
        years > 1 ? 's' : ''
      }`})?`,
      false
    ))
  ) {
    return 0;
  }

  const autoRenew = await client.input.confirm(
    years === 1
      ? `Auto renew yearly for ${chalk.bold(`$${renewalPrice}`)}?`
      : `Auto renew every ${years} years for ${chalk.bold(
          `$${renewalPrice}`
        )}?`,
    true
  );

  // Collect contact information
  const contactInformation = await collectContactInformation(client);

  let buyResult;
  const purchaseStamp = stamp();
  output.spinner('Purchasing');

  try {
    buyResult = await purchaseDomain(
      client,
      domainName,
      purchasePrice,
      years,
      autoRenew,
      contactInformation
    );
  } catch (err: unknown) {
    output.error(
      'An unexpected error occurred while purchasing your domain. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }

  output.stopSpinner();

  if (buyResult instanceof ERRORS.UnsupportedTLD) {
    output.error(
      `The TLD for domain name ${buyResult.meta.domain} is not supported.`
    );
    return 1;
  }

  if (buyResult instanceof ERRORS.TLDNotSupportedViaCLI) {
    output.error(
      `Purchased for the TLD for domain name ${buyResult.meta.domain} are not supported via the CLI. Use the REST API or the dashboard to purchase.`
    );
    return 1;
  }

  if (buyResult instanceof ERRORS.InvalidDomain) {
    output.error(`The domain ${buyResult.meta.domain} is not valid.`);
    return 1;
  }

  if (buyResult instanceof ERRORS.DomainNotAvailable) {
    output.error(`The domain ${buyResult.meta.domain} is not available.`);
    return 1;
  }

  if (buyResult instanceof ERRORS.UnexpectedDomainPurchaseError) {
    output.error(`An unexpected error happened while performing the purchase.`);
    return 1;
  }

  if (buyResult instanceof ERRORS.DomainPaymentError) {
    output.error(`Your card was declined.`);
    return 1;
  }

  output.success(`Domain ${param(domainName)} purchased ${purchaseStamp()}`);
  output.note(
    `You may now use your domain as an alias to your deployments. Run ${getCommandName(
      `alias --help`
    )}`
  );

  return 0;
}
