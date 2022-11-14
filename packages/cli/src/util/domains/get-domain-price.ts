import { stringify } from 'querystring';
import { isAPIError, UnsupportedTLD } from '../errors-ts';
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
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'unsupported_tld') {
        return new UnsupportedTLD(name);
      }

      if (err.status < 500) {
        return err;
      }
    }

    throw err;
  }
}
