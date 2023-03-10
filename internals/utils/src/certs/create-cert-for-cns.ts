import chalk from 'chalk';

import * as ERRORS from '../errors-ts';
import Client from '../client';
import issueCert from './issue-cert';
import mapCertError from './map-cert-error';

export default async function createCertForCns(
  client: Client,
  cns: string[],
  context: string
) {
  const { output } = client;
  output.spinner(`Issuing a certificate for ${chalk.bold(cns.join(', '))}`);
  try {
    const certificate = await issueCert(client, cns);
    return certificate;
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'forbidden') {
        return new ERRORS.DomainPermissionDenied(err.domain, context);
      }

      const mappedError = mapCertError(err, cns);
      if (mappedError) {
        return mappedError;
      }
    }

    throw err;
  } finally {
    output.stopSpinner();
  }
}
