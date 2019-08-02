import chalk from 'chalk';

import * as ERRORS from '../errors-ts';
import Client from '../client';
import issueCert from './issue-cert';
import wait from '../output/wait';
import mapCertError from './map-cert-error';

export default async function createCertForCns(
  client: Client,
  cns: string[],
  context: string
) {
  const cancelWait = wait(
    `Issuing a certificate for ${chalk.bold(cns.join(', '))}`
  );
  try {
    const certificate = await issueCert(client, cns);
    cancelWait();
    return certificate;
  } catch (error) {
    cancelWait();

    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(error.domain, context);
    }

    const mappedError = mapCertError(error, cns);
    if (mappedError) {
      return mappedError;
    }

    throw error;
  }
}
