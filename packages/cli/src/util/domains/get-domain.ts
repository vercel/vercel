import chalk from 'chalk';
import Client from '../client';
import { Domain } from '../../types';

type Response = {
  domain: Domain;
};

export async function getDomain(
  client: Client,
  contextName: string,
  domainName: string
) {
  client.output.spinner(
    `Fetching domain ${domainName} under ${chalk.bold(contextName)}`
  );
  try {
    const { domain } = await client.fetch<Response>(
      `/v4/domains/${domainName}`
    );

    return domain;
  } catch (error) {
    if (error.status < 500) {
      return error;
    }

    throw error;
  }
}
