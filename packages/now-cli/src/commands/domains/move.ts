import chalk from 'chalk';
import plural from 'pluralize';

import { NowContext, User, Team } from '../../types';
import * as ERRORS from '../../util/errors-ts';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import withSpinner from '../../util/with-spinner';
import moveOutDomain from '../../util/domains/move-out-domain';
import isRootDomain from '../../util/is-root-domain';
import textInput from '../../util/input/text';
import param from '../../util/output/param';
import getDomainAliases from '../../util/alias/get-domain-aliases';
import getDomainByName from '../../util/domains/get-domain-by-name';
import promptBool from '../../util/input/prompt-bool';
import getTeams from '../../util/get-teams';
import { getCommandName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
};

export default async function move(
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
  let user = null;

  try {
    ({ contextName, user } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const { domainName, destination } = await getArgs(args);
  if (!isRootDomain(domainName)) {
    output.error(
      `Invalid domain name "${domainName}". Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  const domain = await getDomainByName(client, contextName, domainName);
  if (domain instanceof ERRORS.DomainNotFound) {
    output.error(`Domain not found under ${chalk.bold(contextName)}`);
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
    return 1;
  }
  if (domain instanceof ERRORS.DomainPermissionDenied) {
    output.error(
      `You don't have permissions over domain ${chalk.underline(
        domain.meta.domain
      )} under ${chalk.bold(domain.meta.context)}.`
    );
    return 1;
  }

  const teams = await getTeams(client);
  const matchId = await findDestinationMatch(destination, user, teams);
  if (!matchId && !opts['--yes']) {
    output.warn(
      `You're not a member of ${param(destination)}. ` +
        `${param(
          destination
        )} will have 24 hours to accept your move request before it expires.`
    );
    if (
      !(await promptBool(
        `Are you sure you want to move ${param(domainName)} to ${param(
          destination
        )}?`
      ))
    ) {
      output.log('Aborted');
      return 0;
    }
  }

  if (!opts['--yes']) {
    const aliases = await getDomainAliases(client, domainName);
    if (aliases.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('alias', aliases.length, true)
        )} will be removed. Run ${getCommandName(`alias ls`)} to list them.`
      );
      if (
        !(await promptBool(
          `Are you sure you want to move ${param(domainName)}?`
        ))
      ) {
        output.log('Aborted');
        return 0;
      }
    }
  }

  const context = contextName;
  const moveTokenResult = await withSpinner('Moving', () => {
    return moveOutDomain(client, context, domainName, matchId || destination);
  });
  if (moveTokenResult instanceof ERRORS.DomainMoveConflict) {
    const { suffix, pendingAsyncPurchase } = moveTokenResult.meta;
    if (suffix) {
      output.error(
        `Please remove custom suffix for ${param(domainName)} before moving out`
      );
      return 1;
    }

    if (pendingAsyncPurchase) {
      output.error(
        `Cannot remove ${param(
          domain.name
        )} because it is still in the process of being purchased.`
      );
      return 1;
    }

    output.error(moveTokenResult.message);
    return 1;
  }
  if (moveTokenResult instanceof ERRORS.DomainNotFound) {
    output.error(`Domain not found under ${chalk.bold(contextName)}`);
    output.log(`Run ${getCommandName(`domains ls`)} to see your domains.`);
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
    output.success(`${param(domainName)} was moved to ${param(destination)}.`);
  } else {
    output.success(
      `Sent ${param(destination)} an email to approve the ${param(
        domainName
      )} move request.`
    );
  }
  return 0;
}

async function getArgs(args: string[]) {
  let [domainName, destination] = args;

  if (!domainName) {
    domainName = await textInput({
      label: `- Domain name: `,
      validateValue: isRootDomain,
    });
  }

  if (!destination) {
    destination = await textInput({
      label: `- Destination: `,
      validateValue: (v: string) => Boolean(v && v.length > 0),
    });
  }

  return { domainName, destination };
}

async function findDestinationMatch(
  destination: string,
  user: User,
  teams: Team[]
) {
  if (user.uid === destination || user.username === destination) {
    return user.uid;
  }

  for (const team of teams) {
    if (team.id === destination || team.slug === destination) {
      return team.id;
    }
  }

  return null;
}
