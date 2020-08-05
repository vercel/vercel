import { Cert } from '../../types';
import Client from '../client';
import * as ERRORS from '../errors-ts';

export default async function getCertById(client: Client, id: string) {
  try {
    return await client.fetch<Cert>(`/v5/now/certs/${id}`);
  } catch (error) {
    if (error.code === 'cert_not_found') {
      return new ERRORS.CertNotFound(id);
    }
    throw error;
  }
}
