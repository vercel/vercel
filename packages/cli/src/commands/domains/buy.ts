import chalk from 'chalk';
import psl from 'psl';

import * as ERRORS from '../../util/errors-ts.js';
import Client from '../../util/client.js';
import getDomainPrice from '../../util/domains/get-domain-price.js';
import getDomainStatus from '../../util/domains/get-domain-status.js';
import getScope from '../../util/get-scope.js';
import param from '../../util/output/param.js';
import promptBool from '../../util/input/prompt-bool.js';
import purchaseDomain from '../../util/domains/purchase-domain.js';
import stamp from '../../util/output/stamp.js';
import { getCommandName } from '../../util/pkg-name.js';
import { errorToString } from '@vercel/error-utils';

type Options = {};

export default async function buy(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const { contextName } = await getScope(client);

  const skipConfirmation = !!process.env.CI;

  const [domainName] = args;
  if (!domainName) {
    output.error(
      `Missing domain name. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  const parsedDomain = psl.parse(domainName);
  if (parsedDomain.error) {
    output.error(`The provided domain name ${param(domainName)} is invalid`);
    return 1;
  }

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
      !(await promptBool(
        `Buy now for ${chalk.bold(`$${price}`)} (${`${period}yr${
          period > 1 ? 's' : ''
        }`})?`,
        client
      ))
    ) {
      return 0;
    }

    autoRenew = await promptBool(
      renewalPrice.period === 1
        ? `Auto renew yearly for ${chalk.bold(`$${price}`)}?`
        : `Auto renew every ${renewalPrice.period} years for ${chalk.bold(
            `$${price}`
          )}?`,
      { ...client, defaultValue: true }
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
    console.log(
      `${chalk.cyan('> Success!')} Domain ${param(
        domainName
      )} order was submitted ${purchaseStamp()}`
    );
    output.note(
      `Your domain is processing and will be available once the order is completed.`
    );
    output.print(
      `  An email will be sent upon completion for you to start using your new domain.\n`
    );
  } else {
    console.log(
      `${chalk.cyan('> Success!')} Domain ${param(
        domainName
      )} purchased ${purchaseStamp()}`
    );
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
