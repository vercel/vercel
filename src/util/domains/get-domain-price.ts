import { stringify } from 'querystring';
import { UnsupportedTLD } from '../errors-ts';
import Client from '../client';

type Response = {
  price: number,
  period: number
}

export default async function getDomainPrice(client: Client, name: string) {
  try {
    return await client.fetch<Response>(`/v3/domains/price?${stringify({ name })}`);
  } catch (error) {
    if (error.code === 'unsupported_tld') {
      return new UnsupportedTLD(name);
    }
    throw error;
  }
}
