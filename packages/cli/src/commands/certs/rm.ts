import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from '../../util/output/table';
import type { Cert } from '@vercel-internals/types';
import * as ERRORS from '../../util/errors-ts';
import deleteCertById from '../../util/certs/delete-cert-by-id';
import getCertById from '../../util/certs/get-cert-by-id';
import { getCustomCertsForDomain } from '../../util/certs/get-custom-certs-for-domain';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { CertsRemoveTelemetryClient } from '../../util/telemetry/commands/certs/remove';
import { removeSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import type Client from '../../util/client';

async function rm(client: Client, argv: string[]): Promise<number> {
  const rmStamp = stamp();

  const { telemetryEventStore } = client;

  const telemetry = new CertsRemoveTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args } = parsedArgs;
  const id = args[0];
  telemetry.trackCliArgumentId(id);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('certs rm <id or cn>')}`
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);
  const certs = await getCertsToDelete(client, contextName, id);
  if (certs instanceof ERRORS.CertsPermissionDenied) {
    output.error(
      `You don't have access to ${param(id)}'s certs under ${contextName}.`
    );
    return 1;
  }

  if (certs.length === 0) {
    if (id.includes('.')) {
      output.error(
        `No custom certificates found for "${id}" under ${chalk.bold(
          contextName
        )}`
      );
    } else {
      output.error(
        `No certificates found by id "${id}" under ${chalk.bold(contextName)}`
      );
    }
    return 1;
  }

  const yes = await readConfirmation(
    client,
    'The following certificates will be removed permanently',
    certs
  );

  if (!yes) {
    return 0;
  }

  await Promise.all(certs.map(cert => deleteCertById(client, cert.uid)));
  output.success(
    `${chalk.bold(
      plural('Certificate', certs.length, true)
    )} removed ${rmStamp()}`
  );
  return 0;
}

async function getCertsToDelete(
  client: Client,
  contextName: string,
  id: string
) {
  const cert = await getCertById(client, id);
  if (cert instanceof ERRORS.CertNotFound) {
    const certs = await getCustomCertsForDomain(client, contextName, id);
    if (certs instanceof ERRORS.CertsPermissionDenied) {
      return certs;
    }
    return certs;
  }
  return [cert];
}

function readConfirmation(client: Client, msg: string, certs: Cert[]) {
  return new Promise(resolve => {
    output.log(msg);
    output.print(
      `${table(certs.map(formatCertRow), {
        align: ['l', 'r', 'l'],
        hsep: 6,
      }).replace(/^(.*)/gm, '  $1')}\n`
    );
    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('(y/N) ')}`
    );
    client.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(d.toString().trim().toLowerCase() === 'y');
      })
      .resume();
  });
}

function formatCertRow(cert: Cert) {
  return [
    cert.uid,
    chalk.bold(cert.cns ? cert.cns.join(', ') : '–'),
    ...(cert.created
      ? [chalk.gray(`${ms(Date.now() - new Date(cert.created).getTime())} ago`)]
      : []),
  ];
}

export default rm;
