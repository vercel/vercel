import chalk from 'chalk';
import plural from 'pluralize';

import type Client from '../client';
import eraseLines from '../output/erase-lines';
import getDomainPrice from './get-domain-price';
import getDomainStatus from './get-domain-status';
import purchaseDomain from './purchase-domain';
import stamp from '../output/stamp';
import * as ERRORS from '../errors-ts';
import output from '../../output-manager';
import param from '../output/param';

const isTTY = process.stdout.isTTY;

export default async function purchaseDomainIfAvailable(
  client: Client,
  domain: string,
  contextName: string
) {
  output.spinner(`Checking status of ${chalk.bold(domain)}`);
  const buyDomainStamp = stamp();
  const { available } = await getDomainStatus(client, domain);

  if (available) {
    if (!isTTY) {
      // If we can't prompty and the domain is available, we should fail
      return new ERRORS.DomainNotFound(domain);
    }

    output.debug(`Domain ${domain} is available to be purchased`);

    const domainPrice = await getDomainPrice(client, domain).finally(() => {
      output.stopSpinner();
    });

    if (domainPrice instanceof ERRORS.UnsupportedTLD) {
      return domainPrice;
    }

    if (domainPrice instanceof Error) {
      throw domainPrice;
    }

    const { purchasePrice, years } = domainPrice;

    if (purchasePrice === null) {
      output.error(
        `The domain ${param(domain)} is ${chalk.underline(
          'unavailable'
        )}! ${buyDomainStamp()}`
      );
      return new ERRORS.DomainNotAvailable(domain);
    }

    output.log(
      `Domain not found, but you can buy it under ${chalk.bold(
        contextName
      )}! ${buyDomainStamp()}`
    );

    if (
      !(await client.input.confirm(
        `Buy ${chalk.underline(domain)} for ${chalk.bold(
          `$${purchasePrice}`
        )} (${plural('yr', years, true)})?`,
        false
      ))
    ) {
      output.print(eraseLines(1));
      return new ERRORS.UserAborted();
    }

    output.print(eraseLines(1));
    const result = await purchaseDomain(client, domain, purchasePrice, years);
    if (result instanceof Error) {
      return result;
    }

    return true;
  }

  output.debug(`Domain ${domain} is not available to be purchased`);
  return false;
}
