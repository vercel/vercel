import chalk from 'chalk';

import Now from '../../util';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import stamp from '../../util/output/stamp.ts';
import wait from '../../util/output/wait';
import createCertFromFile from '../../util/certs/create-cert-from-file';
import createCertForCns from '../../util/certs/create-cert-for-cns';

import {
  DomainPermissionDenied,
  InvalidCert,
} from '../../util/errors-ts';
import handleCertError from '../../util/certs/handle-cert-error';

async function add(ctx, opts, args, output) {
  const {
    authConfig: { token },
    config
  } = ctx;
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
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
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

    const result = handleCertError(output, cert);
    if (result === 1) {
      return result
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
