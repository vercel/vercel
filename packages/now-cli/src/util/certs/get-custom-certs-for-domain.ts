import { stringify } from 'querystring';
import { Cert } from '../../types';
import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  certs: Cert[];
};

export async function getCustomCertsForDomain(
  client: Client,
  context: string,
  domain: string
) {
  try {
    const { certs } = await client.fetch<Response>(
      `/v5/now/certs?${stringify({ domain, custom: true })}`
    );
    return certs;
  } catch (error) {
    if (error.code === 'forbidden') {
      return new ERRORS.CertsPermissionDenied(context, domain);
    }
    throw error;
  }
}
