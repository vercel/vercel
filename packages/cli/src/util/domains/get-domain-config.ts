import type Client from '../client';
import type { DomainConfig } from '@vercel-internals/types';
import { isAPIError } from '../errors-ts';

export async function getDomainConfig(client: Client, domainName: string) {
  try {
    const config = await client.fetch<DomainConfig>(
      `/v4/domains/${domainName}/config`
    );

    return config;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }

    throw err;
  }
}
