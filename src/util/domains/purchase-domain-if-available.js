import chalk from 'chalk';
import plural from 'pluralize';

import * as Errors from '../errors';
import eraseLines from '../output/erase-lines';
import getDomainPrice from './get-domain-price';
import getDomainStatus from './get-domain-status';
import promptBool from '../input/prompt-bool';
import purchaseDomain from './purchase-domain';
import stamp from '../output/stamp.ts';
import wait from '../output/wait';

const isTTY = process.stdout.isTTY;

async function purchaseDomainIfAvailable(output, now, domain, contextName) {
  const cancelWait = wait(`Checking status of ${chalk.bold(domain)}`);
  const buyDomainStamp = stamp();
  const { available } = await getDomainStatus(now, domain);

  if (available) {
    if (!isTTY) {
      // If we can't prompty and the domain is available, we should fail
      return new Errors.DomainNotFound(domain);
    }

    output.debug(`Domain is available to purchase`);
    const domainPrice = await getDomainPrice(now, domain);
    cancelWait();
    if (
      domainPrice instanceof Errors.UnsupportedTLD ||
      domainPrice instanceof Errors.MissingCreditCard
    ) {
      return domainPrice;
    }

    const { price, period } = domainPrice;
    output.log(
      `Domain not found, but you can buy it under ${chalk.bold(
        contextName
      )}! ${buyDomainStamp()}`
    );

    if (
      !await promptBool(
        `Buy ${chalk.underline(domain)} for ${chalk.bold(
          `$${price}`
        )} (${plural('yr', period, true)})?`
      )
    ) {
      output.print(eraseLines(1));
      return new Errors.UserAborted();
    }

    output.print(eraseLines(1));
    const result = await purchaseDomain(output, now, domain);
    if (
      result instanceof Errors.DomainNotAvailable ||
      result instanceof Errors.DomainServiceNotAvailable ||
      result instanceof Errors.InvalidDomain ||
      result instanceof Errors.PaymentSourceNotFound ||
      result instanceof Errors.UnexpectedDomainPurchaseError
    ) {
      return result;
    }

    return true;
  }

  output.debug(`Domain can't be purchased`);
  cancelWait();
  return false;
}

export default purchaseDomainIfAvailable;
