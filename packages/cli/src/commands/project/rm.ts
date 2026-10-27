import chalk from 'chalk';
import { getPlatformEnv } from '@vercel/build-utils';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { ProjectRmTelemetryClient } from '../../util/telemetry/commands/project/rm';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { canPrompt } from '../../util/can-prompt';
import {
  buildCommandWithYes,
  outputActionRequired,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { getContextName } from '../../util/get-scope';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import getTeams from '../../util/teams/get-teams';
import { removeSubcommand } from './command';

const e = encodeURIComponent;

export default async function rm(client: Client, argv: string[]) {
  const telemetryClient = new ProjectRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project delete <name>')}`
      )}`
    );
    return 2;
  }

  const name = args[0];
  const yes = flags['--yes'] ?? false;
  telemetryClient.trackCliArgumentName(name);
  telemetryClient.trackCliFlagYes(yes);

  // Deleting a project also deletes its deployments, so `--yes` skips typing
  // the name only when the team is explicit. Otherwise a link or a saved team
  // could point the delete at a same-named project in another team.
  if (!(yes && (await isTeamExplicit(client)))) {
    if (canPrompt(client)) {
      await printDeletionPreview(client, name);
      const typed = await client.input.text({
        message: `To confirm, type the project name "${name}":`,
      });
      if (typed !== name) {
        output.log('Canceled. Nothing was changed.');
        return 130;
      }
    } else if (yes) {
      return refuse(client, {
        reason: AGENT_REASON.MISSING_SCOPE,
        message: `Can't delete project ${name} without a team in non-interactive mode.`,
        recovery: 'Pass the team with --scope:',
        command: `${buildCommandWithYes(client.argv)} --scope <TEAM>`,
        when: `Replace <TEAM> with the team that owns ${name}`,
      });
    } else if (client.stdin.isTTY || client.isAgent || client.nonInteractive) {
      // Agents, `--non-interactive`, and non-interactive runs on a terminal
      // never prompt.
      // The suggested command also names the team when `--yes` would need it.
      const teamNamed = await isTeamExplicit(client);
      return refuse(client, {
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message: `Can't delete project ${name} without --yes in non-interactive mode.`,
        recovery: 'Delete it after a person approves:',
        command: `${buildCommandWithYes(client.argv)}${teamNamed ? '' : ' --scope <TEAM>'}`,
        when: `Only after a human approves deleting ${name} and its deployments${
          teamNamed ? '' : `. Replace <TEAM> with the team that owns ${name}`
        }`,
        userActionRequired: true,
      });
    } else {
      // Scripts pipe "y" into this prompt today, so it keeps working for now.
      output.warning(
        'Deleting a project without a terminal will need --yes and --scope in a future major version.'
      );
      await printDeletionPreview(client, name);
      const confirmed = await client.input.confirm(
        `${chalk.bold.red('Are you sure?')}`,
        false
      );
      if (!confirmed) {
        output.log('User abort');
        return 0;
      }
    }
  }

  try {
    await client.fetch(`/v2/projects/${e(name)}`, {
      method: 'DELETE',
    });
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      output.error('No such project exists');
      return 1;
    }
    if (isAPIError(err) && err.status === 403) {
      output.error(err.message);
      return 1;
    }
    printError(err);
    return 1;
  }
  output.print('\n');
  printAlignedLabel('Deleted', name, { gutter: '✓' });
  return 0;
}

async function printDeletionPreview(client: Client, projectName: string) {
  printAlignedLabel(
    'Project',
    `${await getContextName(client)}/${projectName}`
  );
  output.print(
    '\n  Deletes the project and all of its deployments.\n  This cannot be undone.\n'
  );
}

/**
 * Whether the team the delete goes to was named with `--scope`, or with a
 * `VERCEL_ORG_ID` that matches it, or is the user's only team. The link and
 * `vercel.json` don't count.
 */
async function isTeamExplicit(client: Client): Promise<boolean> {
  // An empty `--scope` is ignored when the team is chosen, so it names nothing.
  const { flags } = parseArguments(
    client.argv.slice(2),
    {},
    { permissive: true }
  );
  if (flags['--scope'] || flags['--team']) {
    return true;
  }
  // Runs that ignore the saved team choose it from `VERCEL_ORG_ID` here, and
  // the delete below goes to this same team.
  const team = await client.resolveCurrentTeam({ ask: false });
  if (!team) {
    return false;
  }
  const orgId = getPlatformEnv('ORG_ID');
  if (orgId) {
    return orgId === team;
  }
  try {
    const teams = await getTeams(client);
    return teams.length === 1 && teams[0].id === team;
  } catch (err: unknown) {
    output.debug(`Couldn't list teams: ${err}`);
    return false;
  }
}

/** Missing input: exits 2, since adding it to the command makes it work. */
function refuse(
  client: Client,
  opts: {
    reason: string;
    message: string;
    recovery: string;
    command: string;
    when: string;
    userActionRequired?: boolean;
  }
): number {
  outputActionRequired(
    client,
    {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: opts.reason,
      message: opts.message,
      userActionRequired: opts.userActionRequired,
      next: [{ command: opts.command, when: opts.when }],
    },
    2
  );
  output.error(opts.message);
  output.print(`\n  ${opts.recovery}\n    ${opts.command}\n`);
  return 2;
}
