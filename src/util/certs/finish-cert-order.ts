import chalk from 'chalk';
import psl from 'psl';

import { Cert } from '../../types';
import * as Errors from '../errors-ts';
import Client from '../client';
import wait from '../output/wait';

export default async function startCertOrder(
  client: Client,
  cns: string[],
  context: string
) {
  const cancelWait = wait(
    `Issuing a certificate for ${chalk.bold(cns.join(', '))}`
  );
  try {
    const cert = await client.fetch<Cert>('/v3/now/certs', {
      method: 'PATCH',
      body: {
        op: 'finalizeOrder',
        domains: cns
      }
    });
    cancelWait();
    return cert;
  } catch (error) {
    cancelWait();
    if (error.code === 'cert_order_not_found') {
      return new Errors.CertOrderNotFound(cns);
    }
    if (error.code === 'configuration_error') {
      const { domain, subdomain } = psl.parse(error.domain);
      return new Errors.DomainConfigurationError(
        domain as string,
        subdomain as string,
        error.external
      );
    }
    if (error.code === 'forbidden') {
      return new Errors.DomainPermissionDenied(error.domain, context);
    }
    if (error.code === 'rate_limited') {
      return new Errors.TooManyCertificates(error.domains);
    }
    if (error.code === 'too_many_requests') {
      return new Errors.TooManyRequests('certificates', error.retryAfter);
    }
    if (error.code === 'validation_running') {
      return new Errors.DomainValidationRunning(error.domain);
    }
    if (error.code === 'should_share_root_domain') {
      return new Errors.DomainsShouldShareRoot(error.domains);
    }
    if (error.code === 'cant_solve_challenge') {
      return new Errors.CantSolveChallenge(error.domain, error.type);
    }

    throw error;
  }
}
