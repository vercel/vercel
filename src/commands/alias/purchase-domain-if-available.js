//      
import chalk from 'chalk';
import plural from 'pluralize';

// Utils
import eraseLines from '../../util/output/erase-lines';
import promptBool from '../../util/input/prompt-bool';
import stamp from '../../util/output/stamp';
import wait from '../../util/output/wait';

import { NowError } from '../../util/now-error';
import * as Errors from '../../util/errors';
import getDomainPrice from '../../util/domains/get-domain-price';
import getDomainStatus from '../../util/domains/get-domain-status';
import purchaseDomain from './purchase-domain';

// $FlowFixMe
const isTTY = process.stdout.isTTY;

async function purchaseDomainIfAvailable(
  output        ,
  now     ,
  domain        ,
  contextName        
) {
  const cancelWait = wait(`Checking status of ${chalk.bold(domain)}`);
  const buyDomainStamp = stamp();
  const { available } = await getDomainStatus(now, domain);

  if (available) {
    // If we can't prompty and the domain is available, we should fail
    if (!isTTY) {
      return new Errors.DomainNotFound(domain);
    }
    output.debug(`Domain is available to purchase`);

    const domainPrice = await getDomainPrice(now, domain);
    cancelWait();
    if (
      domainPrice instanceof Errors.InvalidCoupon ||
      domainPrice instanceof Errors.UsedCoupon ||
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
    if (result instanceof NowError) {
      return result;
    }

    return true;
  } 
    output.debug(`Domain can't be purchased`);
    cancelWait();
    return false;
  
}

export default purchaseDomainIfAvailable;
