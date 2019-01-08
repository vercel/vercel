import psl from 'psl';
import chalk from 'chalk';

import * as ERRORS from '../errors-ts';
import Client from '../client';
import issueCert from './issue-cert';
import wait from '../output/wait';

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
    if (error.code === 'configuration_error') {
      const { domain, subdomain } = psl.parse(error.domain);
      return new ERRORS.DomainConfigurationError(
        domain as string,
        subdomain as string,
        Boolean(error.external)
      );
    }
    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(error.domain, context);
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
    if (error.code === 'wildcard_not_allowed') {
      return new ERRORS.WildcardNotAllowed(error.domain);
    }
    throw error;
  }
}
