// @flow
import chalk from 'chalk';
import psl from 'psl';
import { Now } from '../types';
import * as Errors from '../errors';
import wait from '../output/wait';
import type { Certificate } from '../types';

export default async function startCertOrder(
  now: Now,
  cns: string[],
  context: string
) {
  const cancelWait = wait(
    `Issuing a certificate for ${chalk.bold(cns.join(', '))}`
  );
  try {
    const cert: Certificate = await now.fetch('/v3/now/certs', {
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
    } else if (error.code === 'configuration_error') {
      const { domain, subdomain } = psl.parse(error.domain);
      return new Errors.DomainConfigurationError(
        domain,
        subdomain,
        error.external
      );
    } else if (error.code === 'forbidden') {
      return new Errors.DomainPermissionDenied(error.domain, context);
    } else if (error.code === 'wildcard_not_allowed') {
      return new Errors.CantGenerateWildcardCert();
    } else if (error.code === 'rate_limited') {
      return new Errors.TooManyCertificates(error.domains);
    } else if (error.code === 'too_many_requests') {
      return new Errors.TooManyRequests({
        api: 'certificates',
        retryAfter: error.retryAfter
      });
    } else if (error.code === 'validation_running') {
      return new Errors.DomainValidationRunning(error.domain);
    } else if (error.code === 'should_share_root_domain') {
      return new Errors.DomainsShouldShareRoot(error.domains);
    } else if (error.code === 'cant_solve_challenge') {
      return new Errors.CantSolveChallenge(error.domain, error.type);
    } else if (error.code === 'invalid_wildcard_domain') {
      return new Errors.InvalidWildcardDomain(error.domain);
    } else {
      // Throw unexpected errors
      throw error;
    }
  }
}
