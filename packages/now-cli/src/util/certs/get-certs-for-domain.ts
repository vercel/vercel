import { stringify } from 'querystring';
import { Cert } from '../../types';
import { Output } from '../output';
import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  certs: Cert[];
};

export default async function getCertsForDomain(
  output: Output,
  client: Client,
  context: string,
  domain: string
) {
  try {
    const { certs } = await client.fetch<Response>(
      `/v3/now/certs?${stringify({ domain })}`
    );
    return certs;
  } catch (error) {
    if (error.code === 'forbidden') {
      return new ERRORS.CertsPermissionDenied(context, domain);
    }
    throw error;
  }
}
