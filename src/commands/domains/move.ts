import chalk from 'chalk';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import getScope from '../../util/get-scope';
import withSpinner from '../../util/with-spinner';
import moveOutDomain from '../../util/domains/move-out-domain';
import isRootDomain from '../../util/is-root-domain';
import textInput from '../../util/input/text';
import param from '../../util/output/param';

type Options = {
  '--debug': boolean;
};

export default async function move(
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

  const { domainName, destination } = await getArgs(args);
  if (!isRootDomain(domainName)) {
    output.error(
      `Invalid domain name "${domainName}". Run ${cmd('now domains --help')}`
    );
    return 1;
  }

  const context = contextName;
  const moveTokenResult = await withSpinner('Requesting move', () => {
    return moveOutDomain(client, context, domainName, destination);
  });
  if (moveTokenResult instanceof ERRORS.DomainMoveConflict) {
    output.error(
      `Please remove custom suffix for ${param(domainName)} before moving out`
    );
    return 1;
  }
  if (moveTokenResult instanceof ERRORS.DomainNotFound) {
    output.error(`Domain not found under ${chalk.bold(contextName)}`);
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }
  if (moveTokenResult instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You don't have permissions over domain ${chalk.underline(
        moveTokenResult.meta.domain
      )} under ${chalk.bold(moveTokenResult.meta.context)}.`
    );
    return 1;
  }
  if (moveTokenResult instanceof ERRORS.InvalidMoveDestination) {
    output.error(
      `Destination ${chalk.bold(
        destination
      )} is invalid. Please supply a valid username, email, team slug, user id, or team id.`
    );
    return 1;
  }

  const { moved } = moveTokenResult;
  if (moved) {
    output.log(
      `${chalk.cyan('> Success!')} ${param(domainName)} was moved to ${param(
        destination
      )}.`
    );
  } else {
    output.log(
      `${chalk.cyan('> Success!')} Sent ${param(
        destination
      )} an email to approve the ${param(domainName)} move request.`
    );
  }
  return 0;
}

async function getArgs(args: string[]) {
  let [domainName, destination] = args;

  if (!domainName) {
    domainName = await textInput({
      label: `- Domain name: `,
      validateValue: isRootDomain
    });
  }

  if (!destination) {
    destination = await textInput({
      label: `- Destination: `,
      validateValue: (v: string) => Boolean(v && v.length > 0)
    });
  }

  return { domainName, destination };
}
