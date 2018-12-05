import chalk from 'chalk';
import wait from '../output/wait';
import { DomainPermissionDenied, DomainNotFound } from '../errors';

async function getDomainByName(output, now, contextName, domainName) {
  const cancelWait = wait(`Fetching domains ${domainName} under ${chalk.bold(contextName)}`);
  try {
    const payload = await now.fetch(`/v4/domains/${domainName}`);
    cancelWait();
    return payload;
  } catch (error) {
    cancelWait();
    if (error.status === 404) {
      return new DomainNotFound(domainName);
    }

    if (error.status === 403) {
      return new DomainPermissionDenied(domainName, contextName);
    }

    throw error;
  }
}

export default getDomainByName;
