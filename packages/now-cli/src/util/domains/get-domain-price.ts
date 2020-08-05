import { stringify } from 'querystring';
import { UnsupportedTLD } from '../errors-ts';
import Client from '../client';

type Response = {
  price: number;
  period: number;
};

export default async function getDomainPrice(
  client: Client,
  name: string,
  type?: 'new' | 'renewal'
) {
  try {
    const querystr = type ? stringify({ name, type }) : stringify({ name });
    return await client.fetch<Response>(`/v3/domains/price?${querystr}`);
  } catch (error) {
    if (error.code === 'unsupported_tld') {
      return new UnsupportedTLD(name);
    }

    if (error.status < 500) {
      return error;
    }

    throw error;
  }
}
