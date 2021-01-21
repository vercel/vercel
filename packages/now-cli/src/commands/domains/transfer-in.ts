import chalk from 'chalk';

import { NowContext } from '../../types';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import transferInDomain from '../../util/domains/transfer-in-domain';
import stamp from '../../util/output/stamp';
import getAuthCode from '../../util/domains/get-auth-code';
import withSpinner from '../../util/with-spinner';
import getDomainPrice from '../../util/domains/get-domain-price';
import checkTransfer from '../../util/domains/check-transfer';
import promptBool from '../../util/input/prompt-bool';
import isRootDomain from '../../util/is-root-domain';
import { getCommandName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
  '--code': string;
};

export default async function transferIn(
  ctx: NowContext,
  opts: Options,
  args: string[]
) {
  const {
    authConfig: { token },
    output,
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug, output });
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

  const [domainName] = args;
  if (!domainName) {
    output.error(
      `Missing domain name. Run ${getCommandName(`domains --help`)}`
    );
    return 1;
  }

  if (!isRootDomain(domainName)) {
    output.error(
      `Invalid domain name ${param(domainName)}. Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  const availableStamp = stamp();
  const [domainPrice, { transferable, transferPolicy }] = await Promise.all([
    getDomainPrice(client, domainName, 'renewal'),
    checkTransfer(client, domainName),
  ]);

  if (domainPrice instanceof Error) {
    output.prettyError(domainPrice);
    return 1;
  }

  if (!transferable) {
    output.error(`The domain ${param(domainName)} is not transferable.`);
    return 1;
  }

  const { price } = domainPrice;
  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to transfer under ${chalk.bold(contextName)}! ${availableStamp()}`
  );

  const authCode = await getAuthCode(opts['--code']);

  const shouldTransfer = await promptBool(
    transferPolicy === 'no-change'
      ? `Transfer now for ${chalk.bold(`$${price}`)}?`
      : `Transfer now with 1yr renewal for ${chalk.bold(`$${price}`)}?`
  );
  if (!shouldTransfer) {
    return 0;
  }

  const transferStamp = stamp();
  const transferInResult = await withSpinner(
    `Initiating transfer for domain ${domainName}`,
    () => transferInDomain(client, domainName, authCode, price)
  );

  if (transferInResult instanceof ERRORS.InvalidDomain) {
    output.error(`The domain ${transferInResult.meta.domain} is not valid.`);
    return 1;
  }

  if (
    transferInResult instanceof ERRORS.DomainNotAvailable ||
    transferInResult instanceof ERRORS.DomainNotTransferable
  ) {
    output.error(
      `The domain "${transferInResult.meta.domain}" is not transferable.`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.InvalidTransferAuthCode) {
    output.error(
      `The provided auth code does not match with the one expected by the current registar`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.SourceNotFound) {
    output.error(
      `Could not purchase domain. Please add a payment method using ${getCommandName(
        `billing add`
      )}.`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.DomainRegistrationFailed) {
    output.error(`Could not transfer domain. ${transferInResult.message}`);
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success!')} Domain ${param(
      domainName
    )} transfer started ${transferStamp()}`
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
