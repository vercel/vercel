// @flow
import { parse } from 'psl';
import chalk from 'chalk';
import ms from 'ms';

import { CLIContext, Output } from '../../util/types';
import { handleDomainConfigurationError } from '../../util/error-handlers';
import * as Errors from '../../util/errors';
import dnsTable from '../../util/dns-table';
import getCnsFromArgs from '../../util/certs/get-cns-from-args';
import getScope from '../../util/get-scope';
import Now from '../../util';
import stamp from '../../util/output/stamp';
import type { CLICertsOptions } from '../../util/types';

import createCertForCns from '../../util/certs/create-cert-for-cns';
import createCertFromFile from '../../util/certs/create-cert-from-file';
import finishCertOrder from '../../util/certs/finish-cert-order';
import startCertOrder from '../../util/certs/start-cert-order';

export default async function issue(
  ctx: CLIContext,
  opts: CLICertsOptions,
  args: string[],
  output: Output
): Promise<number> {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const addStamp = stamp();

  let cert;

  const {
    ['--challenge-only']: challengeOnly,
    ['--overwrite']: overwite,
    ['--debug']: debugEnabled,
    ['--crt']: crtPath,
    ['--key']: keyPath,
    ['--ca']: caPath
  } = opts;

  const { contextName } = await getScope({
    apiUrl,
    token,
    debug: debugEnabled,
    currentTeam
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });

  if (overwite) {
    output.error('Overwrite option is deprecated');
    now.close();
    return 1;
  }

  if (crtPath || keyPath || caPath) {
    if (args.length !== 0 || (!crtPath || !keyPath || !caPath)) {
      output.error(
        `Invalid number of arguments to create a custom certificate entry. Usage:`
      );
      output.print(
        `  ${chalk.cyan(
          `now certs issue --crt <domain.crt> --key <domain.key> --ca <ca.crt>`
        )}\n`
      );
      now.close();
      return 1;
    }

    // Create a custom certificate from the given file paths
    cert = await createCertFromFile(now, keyPath, crtPath, caPath, contextName);
    if (cert instanceof Errors.InvalidCert) {
      output.error(
        `The provided certificate is not valid and cannot be added.`
      );
      return 1;
    } else if (cert instanceof Errors.DomainPermissionDenied) {
      output.error(
        `You do not have permissions over domain ${chalk.underline(
          cert.meta.domain
        )} under ${chalk.bold(cert.meta.context)}.`
      );
      return 1;
    }

    // Print success message
    output.success(
      `Certificate entry for ${chalk.bold(
        cert.cns.join(', ')
      )} created ${addStamp()}`
    );
    return 0;
  }

  if (args.length < 1) {
    output.error(
      `Invalid number of arguments to create a custom certificate entry. Usage:`
    );
    output.print(`  ${chalk.cyan(`now certs add <cn>[, <cn>]`)}\n`);
    now.close();
    return 1;
  }

  const cns = getCnsFromArgs(args);

  // If the user specifies that he wants the challenge to be solved manually, we request the
  // order, show the result challenges and finish immediately.
  if (challengeOnly) {
    return await runStartOrder(output, now, cns, contextName, addStamp);
  }

  // If the user does not specify anything, we try to fullfill a pending order that may exist
  // and if it doesn't exist we try to issue the cert solving from the server
  cert = await finishCertOrder(now, cns, contextName);
  if (cert instanceof Errors.CertOrderNotFound) {
    cert = await createCertForCns(now, cns, contextName);
  }

  if (cert instanceof Errors.CantSolveChallenge) {
    output.error(
      `We could not solve the ${cert.meta.type} challenge for domain ${cert.meta
        .domain}.`
    );
    if (cert.meta.type === 'dns-01') {
      output.log(
        `The certificate provider could not resolve the required DNS record queries.`
      );
      output.print(
        '  Read more: https://err.sh/now-cli/cant-solve-challenge\n'
      );
    } else {
      output.log(
        `The certificate provider could not resolve the HTTP queries for ${cert
          .meta.domain}.`
      );
      output.print(
        `  The DNS propagation may take a few minutes, please verify your settings:\n\n`
      );
      output.print(dnsTable([['', 'ALIAS', 'alias.zeit.co']]) + '\n\n');
      output.log(
        `Alternatively, you can solve DNS challenges manually after running:\n`
      );
      output.print(
        `  ${chalk.cyan(`now certs issue --challenge-only ${cns.join(' ')}`)}\n`
      );
      output.print(
        '  Read more: https://err.sh/now-cli/cant-solve-challenge\n'
      );
    }
    return 1;
  } else if (cert instanceof Errors.TooManyRequests) {
    output.error(
      `Too many requests detected for ${cert.meta
        .api} API. Try again in ${ms(cert.meta.retryAfter * 1000, {
        long: true
      })}.`
    );
    return 1;
  } else if (cert instanceof Errors.TooManyCertificates) {
    output.error(
      `Too many certificates already issued for exact set of domains: ${cert.meta.domains.join(
        ', '
      )}`
    );
    return 1;
  } else if (cert instanceof Errors.DomainValidationRunning) {
    output.error(
      `There is a validation in course for ${chalk.underline(
        cert.meta.domain
      )}. Please wait for it to complete.`
    );
    return 1;
  } else if (cert instanceof Errors.DomainConfigurationError) {
    handleDomainConfigurationError(output, cert);
    return 1;
  } else if (cert instanceof Errors.CantGenerateWildcardCert) {
    return await runStartOrder(output, now, cns, contextName, addStamp, {
      fallingBack: true
    });
  } else if (cert instanceof Errors.DomainsShouldShareRoot) {
    output.error(`All given common names should share the same root domain.`);
    return 1;
  } else if (cert instanceof Errors.InvalidWildcardDomain) {
    output.error(
      `Invalid domain ${chalk.underline(
        cert.meta.domain
      )}. Wildcard domains can only be followed by a root domain.`
    );
    return 1;
  } else if (cert instanceof Errors.DomainPermissionDenied) {
    output.error(
      `You do not have permissions over domain ${chalk.underline(
        cert.meta.domain
      )} under ${chalk.bold(cert.meta.context)}.`
    );
    return 1;
  }

  output.success(
    `Certificate entry for ${chalk.bold(
      cert.cns.join(', ')
    )} created ${addStamp()}`
  );
  return 0;
}

async function runStartOrder(
  output: Output,
  now: Now,
  cns: string[],
  contextName: string,
  stamp: () => string,
  { fallingBack = false }: { fallingBack: boolean } = {}
) {
  const { challengesToResolve } = await startCertOrder(now, cns, contextName);
  const pendingChallenges = challengesToResolve.filter(
    challenge => challenge.status === 'pending'
  );

  if (fallingBack) {
    output.warn(
      `To generate a wildcard certificate for domain for an external domain you must solve challenges manually.`
    );
  }

  if (pendingChallenges.length === 0) {
    output.log(
      `A certificate issuance for ${chalk.bold(
        cns.join(', ')
      )} has been started ${stamp()}`
    );
    output.print(
      `  There are no pending challenges. Finish the issuance by running: \n`
    );
    output.print(`  ${chalk.cyan(`now certs issue ${cns.join(' ')}`)}\n`);
    return 0;
  }

  output.log(
    `A certificate issuance for ${chalk.bold(
      cns.join(', ')
    )} has been started ${stamp()}`
  );
  output.print(
    `  Add the following TXT records with your registrar to be able to the solve the DNS challenge:\n\n`
  );
  const [header, ...rows] = dnsTable(
    pendingChallenges.map(challenge => [
      parse(challenge.domain).subdomain
        ? `_acme-challenge.${parse(challenge.domain).subdomain}`
        : `_acme-challenge`,
      'TXT',
      challenge.value
    ])
  ).split('\n');

  output.print(header + '\n');
  process.stdout.write(rows.join('\n') + '\n\n');
  output.log(`To issue the certificate once the records are added, run:`);
  output.print(`  ${chalk.cyan(`now certs issue ${cns.join(' ')}`)}\n`);
  output.print(
    '  Read more: https://err.sh/now-cli/solve-challenges-manually\n'
  );
  return 0;
}
