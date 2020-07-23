import chalk from 'chalk';
import Client from '../client';
import wait from '../output/wait';
import { DomainConfig } from '../../types';

export async function getDomainConfig(
  client: Client,
  contextName: string,
  domainName: string
) {
  const cancelWait = wait(
    `Fetching domain config ${domainName} under ${chalk.bold(contextName)}`
  );
  try {
    const config = await client.fetch<DomainConfig>(
      `/v4/domains/${domainName}/config`
    );

    return config;
  } catch (error) {
    if (error.status < 500) {
      return error;
    }

    throw error;
  } finally {
    cancelWait();
  }
}
