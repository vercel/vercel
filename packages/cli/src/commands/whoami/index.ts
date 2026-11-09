import { relative } from 'path';
import chalk from 'chalk';
import { getPlatformEnv } from '@vercel/build-utils';
import type { ProjectLink } from '@vercel-internals/types';
import { help } from '../help';
import { whoamiCommand } from './command';

import getScope, { type ScopeContext } from '../../util/get-scope';
import getTeams from '../../util/teams/get-teams';
import { getLinkFromDir, getVercelDirectory } from '../../util/projects/link';
import { getRepoLink, findProjectsFromPath } from '../../util/link/repo';
import pkg from '../../util/pkg';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { WhoamiTelemetryClient } from '../../util/telemetry/commands/whoami';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import getUser from '../../util/get-user';
import { getWhoamiCachedAnswer } from './cached';
import { isAppPrincipalEnabled } from '../../util/app';

export default async function whoami(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(whoamiCommand.options);

  const telemetry = new WhoamiTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('whoami');
    output.print(
      help(whoamiCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagCached(parsedArgs.flags['--cached']);

  if (!client.authConfig.token) {
    if (asJson) {
      const jsonOutput = {
        loggedIn: false,
        cliVersion: pkg.version,
        linkedProject: await getLinkedProjectJson(client),
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    } else {
      output.log('Logged out.');
      output.log(
        `Run ${getCommandName('deploy --temporary')} to create a temporary deployment you can claim later, or ${getCommandName('login')} to log in.`
      );
    }
    return 1;
  }

  // `--cached` answers from the username the last user lookup saved, without a
  // request. Without one, this falls through to asking Vercel, which saves it.
  const cachedUsername = getWhoamiCachedAnswer(
    client.argv.slice(2),
    client.authConfig
  );
  if (cachedUsername) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ username: cachedUsername, cached: true }, null, 2)}\n`
      );
    } else if (client.stdout.isTTY) {
      output.log(`Logged in as ${chalk.bold(cachedUsername)} (cached)`);
    } else {
      client.stdout.write(`${cachedUsername}\n`);
    }
    return 0;
  }
  if (parsedArgs.flags['--cached']) {
    output.debug('No cached username, checking with Vercel.');
  }

  // Piped output is only the username, so it needs the user but not the team.
  // App tokens have no user, so they keep the full lookup below.
  if (!asJson && !client.stdout.isTTY && !isAppPrincipalEnabled()) {
    const user = await getUser(client);
    client.stdout.write(`${user.username}\n`);
    return 0;
  }

  // The team list and project link only appear in JSON, so plain `whoami`
  // makes no extra request.
  const [scope, teams, linkedProject] = await Promise.all([
    getScope(client, {
      resolveLocalScope: true,
      chooseTeam: false,
    }),
    asJson ? getTeamsJson(client) : null,
    asJson ? getLinkedProjectJson(client) : null,
  ]);
  const { user, team, app, globalTeam } = scope;
  const plan = (team ? team.billing?.plan : user?.billing?.plan) ?? null;

  // A local override exists when the effective team (from the linked project)
  // differs from the globally-selected team (from `vc switch`). We only treat
  // it as an override when it wasn't caused by an explicit `--scope`/`--team`
  // flag, since those are user-directed rather than context-inferred.
  const hasLocalOverride =
    !scope.explicitScopeProvided &&
    ((team?.id ?? null) !== (globalTeam?.id ?? null) ||
      // `team` being null while a local project linked to personal scope
      // exists while a global team is selected is also a mismatch.
      scope.scopeMismatch);

  if (asJson) {
    const jsonOutput: any = {
      team: team
        ? {
            id: team.id,
            slug: team.slug,
            name: team.name,
            plan,
          }
        : null,
      plan,
    };

    if (user) {
      jsonOutput.username = user.username;
      jsonOutput.email = user.email;
      jsonOutput.name = user.name;
    }

    if (app) {
      jsonOutput.app = app;
    }

    // `--cached` found no usable saved name, so say this answer came from Vercel.
    if (parsedArgs.flags['--cached']) {
      jsonOutput.cached = false;
    }

    if (hasLocalOverride) {
      jsonOutput.localOverride = true;
      jsonOutput.globalTeam = globalTeam
        ? { id: globalTeam.id, slug: globalTeam.slug, name: globalTeam.name }
        : null;
    }

    jsonOutput.teams = teams;
    jsonOutput.linkedProject = linkedProject;
    jsonOutput.cliVersion = pkg.version;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (client.stdout.isTTY) {
    output.log(`Logged in as ${chalk.bold(formatUsername(scope))}`);

    if (team) {
      output.log(
        `Active team: ${chalk.bold(team.slug)}${
          team.name && team.name !== team.slug ? ` (${team.name})` : ''
        }`
      );
    } else {
      output.log(
        `Active team: ${chalk.bold(
          client.isTeamUnchosen() ? 'None' : 'Personal Account'
        )}`
      );
    }
    if (plan) {
      output.log(`Active team plan: ${chalk.bold(formatBillingPlan(plan))}`);
    }
    if (hasLocalOverride) {
      const globalLabel = globalTeam ? globalTeam.slug : 'Personal Account';
      const localLabel = team ? team.slug : 'Personal Account';
      output.log(
        `${chalk.yellow('Local override:')} scope is set to ${chalk.bold(
          localLabel
        )} by the linked project in this directory (globally selected: ${chalk.bold(
          globalLabel
        )}).`
      );
    }
  } else {
    // If stdout is not a TTY, only print the username to support piping
    // the output to another file / executable. This preserves the previous
    // behavior for scripts that rely on `vc whoami` printing the logged-in
    // user. Team information is available via `--json`.
    client.stdout.write(`${formatUsername(scope)}\n`);
  }

  return 0;
}

/**
 * Every team the credentials can use, or `null` when the list can't be read
 * (an app token can't list teams).
 */
async function getTeamsJson(client: Client) {
  try {
    const teams = await getTeams(client);
    return teams.map(team => ({
      id: team.id,
      slug: team.slug,
      name: team.name ?? null,
    }));
  } catch (err: unknown) {
    output.debug(`Could not list teams: ${err}`);
    return null;
  }
}

/**
 * The project the current directory is linked to, from `VERCEL_ORG_ID` and
 * `VERCEL_PROJECT_ID` or the local link files. Never makes a request or
 * prompts, so a repository link that matches several projects is `null`.
 */
async function getLinkedProjectJson(client: Client) {
  const envOrgId = getPlatformEnv('ORG_ID');
  const envProjectId = getPlatformEnv('PROJECT_ID');
  if (envOrgId && envProjectId) {
    return { id: envProjectId, name: null, orgId: envOrgId };
  }

  try {
    const link = await getLinkFromDir<ProjectLink>(
      getVercelDirectory(client.cwd)
    );
    if (link) {
      return {
        id: link.projectId,
        name: link.projectName ?? null,
        orgId: link.orgId,
      };
    }

    const repoLink = await getRepoLink(client, client.cwd);
    if (repoLink?.repoConfig) {
      const projects = findProjectsFromPath(
        repoLink.repoConfig.projects,
        relative(repoLink.rootPath, client.cwd)
      );
      if (projects.length === 1) {
        const [project] = projects;
        return {
          id: project.id,
          name: project.name,
          orgId: project.orgId ?? repoLink.repoConfig.orgId ?? null,
        };
      }
    }
  } catch (err: unknown) {
    output.debug(`Could not read the project link: ${err}`);
  }

  return null;
}

function formatUsername(scope: ScopeContext): string {
  if (scope.user) {
    return scope.user.username;
  }

  if (scope.app) {
    return scope.app.id;
  }

  throw new Error(`Could not format principal identity`);
}

function formatBillingPlan(plan: string): string {
  if (plan.toLowerCase() === 'oss') {
    return 'OSS';
  }
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
