//
import ms from 'ms';
import chalk from 'chalk';

import Now from '../../util';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import stamp from '../../util/output/stamp.ts';
import wait from '../../util/output/wait';
import dnsTable from '../../util/format-dns-table.ts';
import { handleDomainConfigurationError } from '../../util/error-handlers';
import createCertFromFile from '../../util/certs/create-cert-from-file';
import createCertForCns from '../../util/certs/create-cert-for-cns';

import {
  CantSolveChallenge,
  DomainConfigurationError,
  DomainPermissionDenied,
  DomainsShouldShareRoot,
  DomainValidationRunning,
  TooManyCertificates,
  TooManyRequests
} from '../../util/errors-ts';

import {
  InvalidCert
} from '../../util/errors'

async function add(ctx, opts, args, output) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const addStamp = stamp();

  let cert;

  const {
    '--overwrite': overwite,
    '--debug': debugEnabled,
    '--crt': crtPath,
    '--key': keyPath,
    '--ca': caPath
  } = opts;

  let contextName = null;
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled
  });

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

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
          `now certs add --crt <domain.crt> --key <domain.key> --ca <ca.crt>`
        )}\n`
      );
      now.close();
      return 1;
    }

    // Create a custom certificate from the given file paths
    cert = await createCertFromFile(now, keyPath, crtPath, caPath, contextName);
    if (cert instanceof InvalidCert) {
      output.error(`The provided certificate is not valid and can't be added.`);
      return 1;
    }
    if (cert instanceof DomainPermissionDenied) {
      output.error(
        `You don't have permissions over domain ${chalk.underline(
          cert.meta.domain
        )} under ${chalk.bold(cert.meta.context)}.`
      );
      return 1;
    }
  } else {
    output.warn(
      `${chalk.cyan(
        'now certs add'
      )} will be soon deprecated. Please use ${chalk.cyan(
        'now certs issue <cn> <cns>'
      )} instead`
    );
    if (args.length < 1) {
      output.error(
        `Invalid number of arguments to create a custom certificate entry. Usage:`
      );
      output.print(`  ${chalk.cyan(`now certs add <cn>[, <cn>]`)}\n`);
      now.close();
      return 1;
    }

    // Create the certificate from the given array of CNs
    const cns = args.reduce((res, item) => [...res, ...item.split(',')], []);
    const cancelWait = wait(
      `Generating a certificate for ${chalk.bold(cns.join(', '))}`
    );
    cert = await createCertForCns(now, cns, contextName);
    cancelWait();
    if (cert instanceof CantSolveChallenge) {
      output.error(
        `We can't solve the ${cert.meta.type} challenge for domain ${cert.meta
          .domain}.`
      );
      if (cert.meta.type === 'dns-01') {
        output.error(
          `The certificate provider could not resolve the DNS queries for ${cert
            .meta.domain}.`
        );
        output.print(
          `  This might happen to new domains or domains with recent DNS changes. Please retry later.\n`
        );
      } else {
        output.error(
          `The certificate provider could not resolve the HTTP queries for ${cert
            .meta.domain}.`
        );
        output.print(
          `  The DNS propagation may take a few minutes, please verify your settings:\n\n`
        );
        output.print(`${dnsTable([['', 'ALIAS', 'alias.zeit.co']])}\n`);
      }
      return 1;
    }
    if (cert instanceof TooManyRequests) {
      output.error(
        `Too many requests detected for ${cert.meta
          .api} API. Try again in ${ms(cert.meta.retryAfter * 1000, {
          long: true
        })}.`
      );
      return 1;
    }
    if (cert instanceof TooManyCertificates) {
      output.error(
        `Too many certificates already issued for exact set of domains: ${cert.meta.domains.join(
          ', '
        )}`
      );
      return 1;
    }
    if (cert instanceof DomainValidationRunning) {
      output.error(
        `There is a validation in course for ${chalk.underline(
          cert.meta.domain
        )}. Wait until it finishes.`
      );
      return 1;
    }
    if (cert instanceof DomainConfigurationError) {
      handleDomainConfigurationError(output, cert);
      return 1;
    }
    if (cert instanceof DomainsShouldShareRoot) {
      output.error(`All given common names should share the same root domain.`);
      return 1;
    }
    if (cert instanceof DomainPermissionDenied) {
      output.error(
        `You don't have permissions over domain ${chalk.underline(
          cert.meta.domain
        )} under ${chalk.bold(cert.meta.context)}.`
      );
      return 1;
    }
  }

  // Print success message
  output.success(
    `Certificate entry for ${chalk.bold(
      cert.cns.join(', ')
    )} created ${addStamp()}`
  );
  return 0;
}

export default add;
