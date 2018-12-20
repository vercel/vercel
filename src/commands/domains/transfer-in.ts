import chalk from 'chalk';
import psl from 'psl';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import getDomainStatus from '../../util/domains/get-domain-status';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import textInput from '../../util/input/text';
import promptBool from '../../util/input/prompt-bool';
import transferInDomain from '../../util/domains/transfer-in-domain';
import stamp from '../../util/output/stamp';
import wait from '../../util/output/wait';

const isValidAuthCode = (code: string) => !!(code && code.length > 0);

type Options = {
  '--debug': boolean;
  '--code': string;
};

export default async function transferIn(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const [domainName] = args;
  if (!domainName) {
    output.error(`Missing domain name. Run ${cmd('now domains --help')}`);
    return 1;
  }

  const { domain: rootDomain, subdomain } = psl.parse(domainName);
  if (subdomain || !rootDomain) {
    output.error(
      `Invalid domain name "${domainName}". Run ${cmd('now domains --help')}`
    );
    return 1;
  }

  const authCode = isValidAuthCode(opts['--code'])
    ? opts['--code']
    : await textInput({
        label: `Transfer auth code: `,
        validateValue: isValidAuthCode
      });

  const transferStamp = stamp();
  const stopTransferSpinner = wait('Transferring');
  const transferInResult = await transferInDomain(client, domainName, authCode);

  stopTransferSpinner();

  if (transferInResult instanceof ERRORS.InvalidDomain) {
    output.error(`The domain ${transferInResult.meta.domain} is not valid.`);
    return 1;
  }

  if (transferInResult instanceof ERRORS.DomainNotAvailable) {
    output.error(
      `The domain ${transferInResult.meta.domain} is not transferable.`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.DomainServiceNotAvailable) {
    output.error(
      `The domain transfer service is not available. Please try again later.`
    );
    return 1;
  }

  if (transferInResult instanceof ERRORS.UnexpectedDomainPurchaseError) {
    output.error(`An unexpected error happened while performing the transfer.`);
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success!')} Domain ${param(
      domainName
    )} transferred ${transferStamp()}`
  );
  if (!transferInResult.verified) {
    output.note(
      `Your domain is not fully configured yet so it may appear as not verified.`
    );
    output.print(
      `  It might take a few minutes, but you will get an email as soon as it is ready.\n`
    );
  } else {
    output.note(
      `You may now use your domain as an alias to your deployments. Run ${cmd(
        'now alias --help'
      )}`
    );
  }
  return 0;
}
