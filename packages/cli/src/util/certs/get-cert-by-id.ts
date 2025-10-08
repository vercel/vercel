import type { Cert } from '@vercel-internals/types';
import type Client from '../client';
import * as ERRORS from '../errors-ts';

export default async function getCertById(client: Client, id: string) {
  try {
    return await client.fetch<Cert>(`/v6/certs/${id}`);
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err) && err.code === 'cert_not_found') {
      return new ERRORS.CertNotFound(id);
    }
    throw err;
  }
}
