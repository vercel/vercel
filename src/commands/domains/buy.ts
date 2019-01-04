import chalk from 'chalk';
import psl from 'psl';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import getDomainPrice from '../../util/domains/get-domain-price';
import getDomainStatus from '../../util/domains/get-domain-status';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import promptBool from '../../util/input/prompt-bool';
import purchaseDomain from '../../util/domains/purchase-domain';
import stamp from '../../util/output/stamp';
import wait from '../../util/output/wait';

type Options = {
  '--debug': boolean;
};

export default async function buy(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const [domainName] = args;
  if (!domainName) {
    output.error(`Missing domain name. Run ${cmd('now domains --help')}`);
    return 1;
  }

  const { domain: rootDomain, subdomain } = psl.parse(domainName);
  if (subdomain || !rootDomain) {
    output.error(
      `Invalid domain name "${domainName}". Run ${cmd('now domains --help')}`
    );
    return 1;
  }

  const availableStamp = stamp();
  const domainPrice = await getDomainPrice(client, domainName);
  if (domainPrice instanceof ERRORS.UnsupportedTLD) {
    output.error(`The TLD for ${param(domainName)} is not supported.`);
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
  if (
    !(await promptBool(
      `Buy now for ${chalk.bold(`$${price}`)} (${`${period}yr${
        period > 1 ? 's' : ''
      }`})?`
    ))
  ) {
    return 0;
  }

  const purchaseStamp = stamp();
  const stopPurchaseSpinner = wait('Purchasing');
  const buyResult = await purchaseDomain(client, domainName, price);

  stopPurchaseSpinner();

  if (buyResult instanceof ERRORS.SourceNotFound) {
    output.error(
      `Could not purchase domain. Please add a payment method using ${cmd(
        'now billing add'
      )}.`
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
        `You may now use your domain as an alias to your deployments. Run ${cmd(
          'now alias --help'
        )}`
      );
    }
  }

  return 0;
}
