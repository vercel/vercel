import { parse } from 'psl';
import chalk from 'chalk';
import ms from 'ms';

import { handleDomainConfigurationError } from '../../util/error-handlers';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import createCertForCns from '../../util/certs/create-cert-for-cns';
import createCertFromFile from '../../util/certs/create-cert-from-file';
import dnsTable from '../../util/format-dns-table';
import finishCertOrder from '../../util/certs/finish-cert-order';
import getCnsFromArgs from '../../util/certs/get-cns-from-args';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import startCertOrder from '../../util/certs/start-cert-order';

type Options = {
  '--ca': string;
  '--challenge-only': boolean;
  '--crt': string;
  '--debug': boolean;
  '--key': string;
  '--overwrite': boolean;
};

export default async function issue(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const addStamp = stamp();

  let cert;

  const {
    '--challenge-only': challengeOnly,
    '--overwrite': overwite,
    '--debug': debugEnabled,
    '--crt': crtPath,
    '--key': keyPath,
    '--ca': caPath
  } = opts;

  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled
  });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  if (overwite) {
    output.error('Overwrite option is deprecated');
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
      return 1;
    }

    // Create a custom certificate from the given file paths
    try {
      cert = await createCertFromFile(
        client,
        keyPath,
        crtPath,
        caPath,
        contextName
      );
    } catch (err) {
      if (err.code === 'ENOENT') {
        output.error(
          `The specified file "${err.path}" doesn't exist.`
        );
        return 1;
      }
      throw err;
    }

    if (cert instanceof ERRORS.InvalidCert) {
      output.error(
        `The provided certificate is not valid and cannot be added.`
      );
      return 1;
    }

    if (cert instanceof ERRORS.DomainPermissionDenied) {
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
    return 1;
  }

  const cns = getCnsFromArgs(args);

  // If the user specifies that he wants the challenge to be solved manually, we request the
  // order, show the result challenges and finish immediately.
  if (challengeOnly) {
    return runStartOrder(output, client, cns, contextName, addStamp);
  }

  // If the user does not specify anything, we try to fullfill a pending order that may exist
  // and if it doesn't exist we try to issue the cert solving from the server
  cert = await finishCertOrder(client, cns, contextName);
  if (cert instanceof ERRORS.CertOrderNotFound) {
    cert = await createCertForCns(client, cns, contextName);
  }

  if (cert instanceof ERRORS.CantSolveChallenge) {
    output.error(
      `We could not solve the ${cert.meta.type} challenge for domain ${
        cert.meta.domain
      }.`
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
        `The certificate provider could not resolve the HTTP queries for ${
          cert.meta.domain
        }.`
      );
      output.print(
        `  The DNS propagation may take a few minutes, please verify your settings:\n\n`
      );
      output.print(`  ${dnsTable([['', 'ALIAS', 'alias.zeit.co']])}\n\n`);
      output.log(
        `Alternatively, you can solve DNS challenges manually after running:\n`
      );
      output.print(
        `  ${chalk.cyan(`now certs issue --challenge-only ${cns.join(' ')}`)}\n`
      );
      output.print(
        '  Read more: https://err.sh/now-cli/cant-solve-challenge\n\n'
      );
    }
    return 1;
  }
  if (cert instanceof ERRORS.TooManyRequests) {
    output.error(
      `Too many requests detected for ${cert.meta.api} API. Try again in ${ms(
        cert.meta.retryAfter * 1000,
        {
          long: true
        }
      )}.`
    );
    return 1;
  }
  if (cert instanceof ERRORS.TooManyCertificates) {
    output.error(
      `Too many certificates already issued for exact set of domains: ${cert.meta.domains.join(
        ', '
      )}`
    );
    return 1;
  }
  if (cert instanceof ERRORS.DomainValidationRunning) {
    output.error(
      `There is a validation in course for ${chalk.underline(
        cert.meta.domain
      )}. Please wait for it to complete.`
    );
    return 1;
  }
  if (cert instanceof ERRORS.DomainConfigurationError) {
    handleDomainConfigurationError(output, cert);
    return 1;
  }
  if (cert instanceof ERRORS.WildcardNotAllowed) {
    return runStartOrder(output, client, cns, contextName, addStamp, {
      fallingBack: true
    });
  }
  if (cert instanceof ERRORS.DomainsShouldShareRoot) {
    output.error(`All given common names should share the same root domain.`);
    return 1;
  }
  if (cert instanceof ERRORS.DomainPermissionDenied) {
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
  client: Client,
  cns: string[],
  contextName: string,
  stamp: () => string,
  { fallingBack = false } = {}
) {
  const { challengesToResolve } = await startCertOrder(
    client,
    cns,
    contextName
  );
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
    pendingChallenges.map(challenge => {
      const parsedDomain = parse(challenge.domain);
      if (parsedDomain.error) {
        throw new ERRORS.InvalidDomain(challenge.domain);
      }
      return [
        parsedDomain.subdomain
          ? `_acme-challenge.${parsedDomain.subdomain}`
          : `_acme-challenge`,
        'TXT',
        challenge.value
      ];
    })
  ).split('\n');

  output.print(`${header}\n`);
  process.stdout.write(`${rows.join('\n')}\n\n`);
  output.log(`To issue the certificate once the records are added, run:`);
  output.print(`  ${chalk.cyan(`now certs issue ${cns.join(' ')}`)}\n`);
  output.print(
    '  Read more: https://err.sh/now-cli/solve-challenges-manually\n'
  );
  return 0;
}
