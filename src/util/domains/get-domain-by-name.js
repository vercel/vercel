import psl from 'psl';
import chalk from 'chalk';

import wait from '../output/wait';
import toHost from '../to-host';
import * as Errors from '../errors';

async function getDomainByName(
  output        ,
  now           ,
  contextName   ,
  domainName
) {
  const cancelWait = wait(`Fetching domain under ${chalk.bold(contextName)}`);
  const result = await getDomain(now, domainName);
  cancelWait();

  if (!result || result instanceof Errors.DomainNotFound) {
    return undefined;
  }

  return result;
}

async function getDomain(now, domainName) {
  try {
    const domain = await now.fetch(
      `/v3/domains/${toHost(domainName)}`
    );

    return domain
      ? { ...domain, name: psl.parse(domainName).domain }
      : domain;
  } catch (error) {
    if (error.status === 404) {
      return new Errors.DomainNotFound(domainName);
    }

    throw error;
  }
}

export default getDomainByName;
