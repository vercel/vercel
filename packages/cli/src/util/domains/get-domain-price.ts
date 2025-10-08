import { isAPIError, UnsupportedTLD } from '../errors-ts';
import type Client from '../client';

type Response = {
  purchasePrice: number | null;
  renewalPrice: number | null;
  transferPrice: number | null;
  years: number;
};

export default async function getDomainPrice(client: Client, name: string) {
  try {
    return await client.fetch<Response>(`/v1/registrar/domains/${name}/price`);
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'tld_not_supported') {
        return new UnsupportedTLD(name);
      }

      if (err.status < 500) {
        return err;
      }
    }

    throw err;
  }
}
