import chalk from 'chalk';
import Client from '../client';
import wait from '../output/wait';
import { Domain } from '../../types';
import { DomainPermissionDenied, DomainNotFound } from '../errors-ts';

type Response = {
  domain: Domain;
};

async function getDomainByName(
  client: Client,
  contextName: string,
  domainName: string
) {
  const cancelWait = wait(
    `Fetching domain ${domainName} under ${chalk.bold(contextName)}`
  );
  try {
    const { domain } = await client.fetch<Response>(
      `/v4/domains/${domainName}`
    );
    cancelWait();
    return domain;
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
