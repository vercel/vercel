import chalk from 'chalk';
import * as ERRORS from '../../util/errors-ts';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import transferInDomain from '../../util/domains/transfer-in-domain';
import stamp from '../../util/output/stamp';
import getAuthCode from '../../util/domains/get-auth-code';
import getDomainPrice from '../../util/domains/get-domain-price';
import isRootDomain from '../../util/is-root-domain';
import { getCommandName } from '../../util/pkg-name';
import { DomainsTransferInTelemetryClient } from '../../util/telemetry/commands/domains/transfer-in';
import output from '../../output-manager';
import { transferInSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function transferIn(client: Client, argv: string[]) {
  const telemetry = new DomainsTransferInTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    transferInSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  telemetry.trackCliOptionCode(opts['--code']);

  const [domainName] = args;
  if (!domainName) {
    output.error(
      `Missing domain name. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  telemetry.trackCliArgumentDomain(domainName);

  if (!isRootDomain(domainName)) {
    output.error(
      `Invalid domain name ${param(domainName)}. Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  const availableStamp = stamp();
  const domainPrice = await getDomainPrice(client, domainName);

  if (domainPrice instanceof Error) {
    output.prettyError(domainPrice);
    return 1;
  }

  const { transferPrice, years } = domainPrice;
  if (transferPrice === null) {
    output.error(`The domain ${param(domainName)} is not transferable.`);
    return 1;
  }

  const { contextName } = await getScope(client);
  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to transfer under ${chalk.bold(contextName)}! ${availableStamp()}`
  );

  const authCode = await getAuthCode(client, opts['--code']);

  const shouldTransfer = await client.input.confirm(
    `Transfer now with 1yr renewal for ${chalk.bold(`$${transferPrice}`)}?`,
    false
  );

  if (!shouldTransfer) {
    return 0;
  }

  const transferStamp = stamp();
  output.spinner(`Initiating transfer for domain ${domainName}`);

  const transferInResult = await transferInDomain(
    client,
    domainName,
    authCode,
    transferPrice,
    years
  );

  if (transferInResult instanceof ERRORS.InvalidDomain) {
    output.error(`The domain ${transferInResult.meta.domain} is not valid.`);
    return 1;
  }

  if (transferInResult instanceof ERRORS.DomainNotAvailable) {
    output.error(
      `The domain "${transferInResult.meta.domain}" is not transferable.`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.UnsupportedTLD) {
    output.error(
      `The TLD for domain name ${transferInResult.meta.domain} is not supported.`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.DomainPaymentError) {
    output.error(`Your card was declined.`);
    return 1;
  }

  if (transferInResult instanceof ERRORS.UnexpectedDomainTransferError) {
    output.error(`An unexpected error happened while initiating the transfer.`);
    return 1;
  }

  output.success(
    `Domain ${param(domainName)} transfer started ${transferStamp()}`
  );
  output.print(
    `  To finalize the transfer, we are waiting for approval from your current registrar.\n`
  );
  output.print(`  You will receive an email upon completion.\n`);
  output.warn(
    `Once transferred, your domain ${param(
      domainName
    )} will be using Vercel DNS.\n`
  );
  output.print(
    `  To transfer with previous DNS records, export the zone file from your previous registrar.\n`
  );
  output.print(`  Then import it to Vercel DNS by using:\n`);
  output.print(
    `    ${getCommandName(`dns import ${domainName} <zonefile>`)}\n\n`
  );
  return 0;
}
