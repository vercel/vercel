import { URLSearchParams } from 'url';
import Client from '../client';
import { Output } from '../output';
import { Cert } from '../../types';
import getCertById from './get-cert-by-id';
import { CertNotFound } from '../errors-ts';

type Response = {
  certs: Cert[];
};

function sortByCreated(a: Cert, b: Cert) {
  const dateA = new Date(a.created);
  const dateB = new Date(b.created);

  if (dateA > dateB) {
    return -1;
  }

  if (dateA < dateB) {
    return 1;
  }

  return 0;
}

export default async function getCerts(output: Output, client: Client, options?: { after?: string; }) {
  const query = new URLSearchParams({ limit: '100' });

  if (options && options.after) {
    const lastCert = await getCertById(output, client, options.after);

    if (lastCert instanceof CertNotFound) {
      throw lastCert;
    }

    query.set('until', new Date(lastCert.created).getTime().toString());
  }

  const { certs } = await client.fetch<Response>(`/v3/now/certs?${query}`);

  return certs.sort(sortByCreated);
}
