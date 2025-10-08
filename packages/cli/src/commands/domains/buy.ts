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
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;

  const [domainName] = args;
  const skipConfirmation = !!process.env.CI;
  telemetry.trackCliArgumentDomain(domainName);

  if (!domainName) {
    output.error(
      `Missing domain name. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  const parsedDomain = parse(domainName);

  const { domain: rootDomain, subdomain } = parsedDomain;
  if (subdomain || !rootDomain) {
    output.error(
      `Invalid domain name "${domainName}". Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  const availableStamp = stamp();
  const [domainPrice, renewalPrice] = await Promise.all([
    getDomainPrice(client, domainName),
    getDomainPrice(client, domainName, 'renewal'),
  ]);

  if (domainPrice instanceof Error) {
    output.prettyError(domainPrice);
    return 1;
  }

  if (renewalPrice instanceof Error) {
    output.prettyError(renewalPrice);
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

  const { period, price } = domainPrice;
  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to buy under ${chalk.bold(contextName)}! ${availableStamp()}`
  );

  let autoRenew;
  if (skipConfirmation) {
    autoRenew = true;
  } else {
    if (
      !(await client.input.confirm(
        `Buy now for ${chalk.bold(`$${price}`)} (${`${period}yr${
          period > 1 ? 's' : ''
        }`})?`,
        false
      ))
    ) {
      return 0;
    }

    autoRenew = await client.input.confirm(
      renewalPrice.period === 1
        ? `Auto renew yearly for ${chalk.bold(`$${price}`)}?`
        : `Auto renew every ${renewalPrice.period} years for ${chalk.bold(
            `$${price}`
          )}?`,
      true
    );
  }

  let buyResult;
  const purchaseStamp = stamp();
  output.spinner('Purchasing');

  try {
    buyResult = await purchaseDomain(client, domainName, price, autoRenew);
  } catch (err: unknown) {
    output.error(
      'An unexpected error occurred while purchasing your domain. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }

  output.stopSpinner();

  if (buyResult instanceof ERRORS.SourceNotFound) {
    output.error(
      `Could not purchase domain. Please add a payment method using the dashboard.`
    );
    return 1;
  }

  if (buyResult instanceof ERRORS.UnsupportedTLD) {
    output.error(
      `The TLD for domain name ${buyResult.meta.domain} is not supported.`
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

  if (buyResult instanceof ERRORS.DomainServiceNotAvailable) {
    output.error(
      `The domain purchase service is not available. Please try again later.`
    );
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

  if (buyResult.pending) {
    output.success(
      `Domain ${param(domainName)} order was submitted ${purchaseStamp()}`
    );
    output.note(
      `Your domain is processing and will be available once the order is completed.`
    );
    output.print(
      `  An email will be sent upon completion for you to start using your new domain.\n`
    );
  } else {
    output.success(`Domain ${param(domainName)} purchased ${purchaseStamp()}`);
    if (!buyResult.verified) {
      output.note(
        `Your domain is not fully configured yet so it may appear as not verified.`
      );
      output.print(
        `  It might take a few minutes, but you will get an email as soon as it is ready.\n`
      );
    } else {
      output.note(
        `You may now use your domain as an alias to your deployments. Run ${getCommandName(
          `alias --help`
        )}`
      );
    }
  }

  return 0;
}
