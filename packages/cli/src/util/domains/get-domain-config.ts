import Client from '../client';
import { DomainConfig } from '../../types';

export async function getDomainConfig(client: Client, domainName: string) {
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
  }
}
