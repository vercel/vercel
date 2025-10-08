import chalk from 'chalk';
import { getSubdomain } from 'tldts';
import * as ERRORS from '../../util/errors-ts';
import type Client from '../../util/client';
import createCertForCns from '../../util/certs/create-cert-for-cns';
import createCertFromFile from '../../util/certs/create-cert-from-file';
import dnsTable from '../../util/format-dns-table';
import finishCertOrder from '../../util/certs/finish-cert-order';
import getCnsFromArgs from '../../util/certs/get-cns-from-args';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import startCertOrder from '../../util/certs/start-cert-order';
import handleCertError from '../../util/certs/handle-cert-error';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { CertsIssueTelemetryClient } from '../../util/telemetry/commands/certs/issue';
import { issueSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';

export default async function issue(
  client: Client,
  argv: string[]
): Promise<number> {
  let cert;
  const { telemetryEventStore } = client;
  const addStamp = stamp();

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(issueSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const {
    '--challenge-only': challengeOnly,
    '--overwrite': overwrite,
    '--crt': crtPath,
    '--key': keyPath,
    '--ca': caPath,
  } = opts;

  const telemetry = new CertsIssueTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });
  telemetry.trackCliFlagChallengeOnly(challengeOnly);
  telemetry.trackCliFlagOverwrite(overwrite);
  telemetry.trackCliOptionCrt(crtPath);
  telemetry.trackCliOptionKey(keyPath);
  telemetry.trackCliOptionCa(caPath);

  if (overwrite) {
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
          getCommandName(
            'certs issue --crt <domain.crt> --key <domain.key> --ca <ca.crt>'
          )
        )}\n`
      );
      return 1;
    }

    // Create a custom certificate from the given file paths
    cert = await createCertFromFile(client, keyPath, crtPath, caPath);

    if (cert instanceof Error) {
      output.error(cert.message);
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
    output.print(
      `  ${chalk.cyan(getCommandName('certs issue <cn>[, <cn>]'))}\n`
    );
    return 1;
  }
  telemetry.trackCliArgumentCn(args[0]);

  const cns = getCnsFromArgs(args);

  const { contextName } = await getScope(client);

  // If the user specifies that he wants the challenge to be solved manually, we request the
  // order, show the result challenges and finish immediately.
  if (challengeOnly) {
    return runStartOrder(client, cns, contextName, addStamp);
  }

  // If the user does not specify anything, we try to fulfill a pending order that may exist
  // and if it doesn't exist we try to issue the cert solving from the server
  cert = await finishCertOrder(client, cns, contextName);
  if (cert instanceof ERRORS.CertOrderNotFound) {
    cert = await createCertForCns(client, cns, contextName);
  }

  if (cert instanceof ERRORS.CertError) {
    if (cert.meta.code === 'wildcard_not_allowed') {
      // Fallback to start cert order when receiving a wildcard_not_allowed error
      return runStartOrder(client, cns, contextName, addStamp, {
        fallingBack: true,
      });
    }
  }

  const handledResult = handleCertError(cert);
  if (handledResult === 1) {
    return handledResult;
  }

  if (handledResult instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You do not have permissions over domain ${chalk.underline(
        handledResult.meta.domain
      )} under ${chalk.bold(handledResult.meta.context)}.`
    );
    return 1;
  }

  output.success(
    `Certificate entry for ${chalk.bold(
      handledResult.cns.join(', ')
    )} created ${addStamp()}`
  );
  return 0;
}

async function runStartOrder(
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
    output.print(
      `  ${chalk.cyan(getCommandName(`certs issue ${cns.join(' ')}`))}\n`
    );
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
      const subdomain = getSubdomain(challenge.domain);
      if (subdomain === null) {
        throw new ERRORS.InvalidDomain(challenge.domain);
      }
      return [
        subdomain ? `_acme-challenge.${subdomain}` : `_acme-challenge`,
        'TXT',
        challenge.value,
      ];
    })
  ).split('\n');

  output.print(`${header}\n`);
  client.stdout.write(`${rows.join('\n')}\n\n`);
  output.log(`To issue the certificate once the records are added, run:`);
  output.print(
    `  ${chalk.cyan(getCommandName(`certs issue ${cns.join(' ')}`))}\n`
  );
  output.print(
    '  Read more: https://err.sh/vercel/solve-challenges-manually\n'
  );
  return 0;
}
