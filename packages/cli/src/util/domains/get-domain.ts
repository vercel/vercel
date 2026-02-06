import type { Domain } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';
import { isAPIError } from '../errors-ts';

type Response = {
  domain: Domain;
};

export async function getDomain(
  client: Client,
  contextName: string,
  domainName: string
) {
  output.spinner(
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
