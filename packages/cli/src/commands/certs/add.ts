import chalk from 'chalk';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import createCertFromFile from '../../util/certs/create-cert-from-file';
import createCertForCns from '../../util/certs/create-cert-for-cns';
import { getCommandName } from '../../util/pkg-name';
import { Cert } from '../../types';

interface Options {
  '--overwrite'?: boolean;
  '--crt'?: string;
  '--key'?: string;
  '--ca'?: string;
}

async function add(
  client: Client,
  opts: Options,
  args: string[]
): Promise<number> {
  const { output } = client;
  const addStamp = stamp();

  let cert: Cert | Error;

  const {
    '--overwrite': overwite,
    '--crt': crtPath,
    '--key': keyPath,
    '--ca': caPath,
  } = opts;

  const { contextName } = await getScope(client);

  if (overwite) {
    output.error('Overwrite option is deprecated');
    return 1;
  }

  if (crtPath || keyPath || caPath) {
    if (args.length !== 0 || !crtPath || !keyPath || !caPath) {
      output.error(
        `Invalid number of arguments to create a custom certificate entry. Usage:`
      );
      output.print(
        `  ${chalk.cyan(
          `${getCommandName(
            'certs add --crt <domain.crt> --key <domain.key> --ca <ca.crt>'
          )}`
        )}\n`
      );
      return 1;
    }

    // Create a custom certificate from the given file paths
    cert = await createCertFromFile(client, keyPath, crtPath, caPath);
  } else {
    output.warn(
      `${chalk.cyan(
        getCommandName('certs add')
      )} will be soon deprecated. Please use ${chalk.cyan(
        getCommandName('certs issue <cn> <cns>')
      )} instead`
    );

    if (args.length < 1) {
      output.error(
        `Invalid number of arguments to create a custom certificate entry. Usage:`
      );
      output.print(
        `  ${chalk.cyan(getCommandName('certs add <cn>[, <cn>]'))}\n`
      );
      return 1;
    }

    // Create the certificate from the given array of CNs
    const cns = args.reduce<string[]>(
      (res, item) => res.concat(item.split(',')),
      []
    );
    output.spinner(
      `Generating a certificate for ${chalk.bold(cns.join(', '))}`
    );

    cert = await createCertForCns(client, cns, contextName);
    output.stopSpinner();
  }

  if (cert instanceof Error) {
    output.error(cert.message);
    return 1;
  } else {
    // Print success message
    output.success(
      `Certificate entry for ${chalk.bold(
        cert.cns.join(', ')
      )} created ${addStamp()}`
    );
  }

  return 0;
}

export default add;
