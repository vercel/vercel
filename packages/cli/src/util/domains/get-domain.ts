import chalk from 'chalk';
import Client from '../client';
import { Domain } from '../../types';
import { isAPIError } from '../errors-ts';

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
      `/v5/domains/${domainName}`
    );

    return domain;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}
