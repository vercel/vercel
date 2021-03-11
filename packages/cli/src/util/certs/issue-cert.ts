import retry from 'async-retry';
import { Cert } from '../../types';
import Client from '../client';

// When it's a configuration error we should retry because of the DNS propagation
// otherwise we bail to handle the error in the upper level
export default async function issueCert(client: Client, cns: string[]) {
  return retry(
    async bail => {
      try {
        return await client.fetch<Cert>('/v3/now/certs', {
          method: 'POST',
          body: { domains: cns }
        });
      } catch (error) {
        if (error.code === 'configuration_error') {
          throw error;
        } else {
          bail(error);
        }
      }
    },
    { retries: 3, minTimeout: 5000, maxTimeout: 15000 }
  ) as Promise<Cert>;
}
