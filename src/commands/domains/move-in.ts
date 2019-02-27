import chalk from 'chalk';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import getScope from '../../util/get-scope';
import withSpinner from '../../util/with-spinner';
import moveDomain from '../../util/domains/move-domain';
import textInput from '../../util/input/text';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';

type Options = {
  '--debug': boolean;
};

export default async function moveIn(
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

  const { domainName, moveToken } = await getArgs(args);
  if (!isRootDomain(domainName)) {
    output.error(
      `Invalid domain name "${domainName}". Run ${cmd('now domains --help')}`
    );
    return 1;
  }

  const domain = await withSpinner('Moving domain', () => {
    return moveDomain(client, domainName, moveToken);
  });
  if (domain instanceof ERRORS.DomainMoveConflict) {
    output.error(
      `Domain cannot be moved because it is being used as a custom suffix.`
    );
    return 1;
  }
  if (domain instanceof ERRORS.DomainNotFound) {
    output.error(`Domain ${param(domainName)} not found.`);
    return 1;
  }
  if (domain instanceof ERRORS.InvalidMoveToken) {
    output.error(`Token ${chalk.bold(token)} has expired or is invalid.`);
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success')} Domain ${chalk.underline(
      domainName
    )} was moved to ${chalk.bold(contextName)}`
  );
  return 0;
}

async function getArgs(args: string[]) {
  let [domainName, moveToken] = args;

  if (!domainName) {
    domainName = await textInput({
      label: `- Domain name: `,
      validateValue: isRootDomain
    });
  }

  if (!moveToken) {
    moveToken = await textInput({
      label: `- Token: `,
      validateValue: (v: string) => Boolean(v && v.length > 0)
    });
  }

  return { domainName, moveToken };
}
