import chalk from 'chalk';
import psl from 'psl';

import { Cert } from '../../types';
import * as ERRORS from '../errors-ts';
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
      return new ERRORS.CertOrderNotFound(cns);
    }
    if (error.code === 'configuration_error') {
      const parsedDomain = psl.parse(error.domain);
      if (parsedDomain.error) {
        throw new ERRORS.DomainConfigurationError(
          error.domain,
          null,
          Boolean(error.external)
        );
      }

      const { domain, subdomain } = parsedDomain;
      return new ERRORS.DomainConfigurationError(
        domain || error.domain,
        subdomain as string,
        error.external
      );
    }
    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(error.domain, context);
    }
    if (error.code === 'conflicting_caa_record') {
      return new ERRORS.ConflictingCAARecord(
        error.domain ? [error.domain] : cns,
        error.message
      );
    }
    if (error.code === 'rate_limited') {
      return new ERRORS.TooManyCertificates(error.domains);
    }
    if (error.code === 'too_many_requests') {
      return new ERRORS.TooManyRequests('certificates', error.retryAfter);
    }
    if (error.code === 'validation_running') {
      return new ERRORS.DomainValidationRunning(error.domain);
    }
    if (error.code === 'should_share_root_domain') {
      return new ERRORS.DomainsShouldShareRoot(error.domains);
    }
    if (error.code === 'cant_solve_challenge') {
      return new ERRORS.CantSolveChallenge(error.domain, error.type);
    }
    if (error.code === 'not_found') {
      return new ERRORS.DomainNotFound(error.domain);
    }

    throw error;
  }
}
