import chalk from 'chalk';

import type { Cert } from '@vercel-internals/types';
import * as ERRORS from '../errors-ts.js';
import Client from '../client.js';
import mapCertError from './map-cert-error.js';

export default async function startCertOrder(
  client: Client,
  cns: string[],
  context: string // eslint-disable-line
) {
  client.output.spinner(
    `Issuing a certificate for ${chalk.bold(cns.join(', '))}`
  );
  try {
    const cert = await client.fetch<Cert>('/v3/now/certs', {
      method: 'PATCH',
      body: {
        op: 'finalizeOrder',
        domains: cns,
      },
    });
    return cert;
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'cert_order_not_found') {
        return new ERRORS.CertOrderNotFound(cns);
      }

      const mappedError = mapCertError(err, cns);
      if (mappedError) {
        return mappedError;
      }
    }

    throw err;
  }
}
