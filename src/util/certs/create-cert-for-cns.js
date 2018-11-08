// @flow
import psl from 'psl';
import chalk from 'chalk';
import retry from 'async-retry';
import * as Errors from '../errors';
import { Now } from '../types';
import type { Certificate } from '../types';
import wait from '../output/wait';

async function createCertForCns(now: Now, cns: string[], context: string) {
  const cancelWait = wait(
    `Issuing a certificate for ${chalk.bold(cns.join(', '))}`
  );
  try {
    const certificate: Certificate = await retry(
      async bail => {
        try {
          return await now.fetch('/v3/now/certs', {
            method: 'POST',
            body: { domains: cns }
          });
        } catch (error) {
          // When it's a configuration error we should retry because of the DNS propagation
          // otherwise we bail to handle the error in the upper level
          if (error.code === 'configuration_error') {
            throw error;
          } else {
            bail(error);
          }
        }
      },
      { retries: 3, minTimeout: 5000, maxTimeout: 15000 }
    );
    cancelWait();
    return certificate;
  } catch (error) {
    cancelWait();
    if (error.code === 'configuration_error') {
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

export default createCertForCns;
