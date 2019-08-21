import { Cert } from '../../types';
import { Output } from '../output/create-output';
import Client from '../client';
import * as ERRORS from '../errors-ts';

export default async function getCertById(
  output: Output,
  client: Client,
  id: string
) {
  try {
    return await client.fetch<Cert>(`/v3/now/certs/${id}`);
  } catch (error) {
    if (error.code === 'cert_not_found') {
      return new ERRORS.CertNotFound(id);
    }
    throw error;
  }
}
