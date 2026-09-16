import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { dangerouslyDeleteImmutableStaticSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { emoji, prependEmoji } from '../../util/emoji';
import { CacheDangerouslyDeleteImmutableStaticTelemetryClient } from '../../util/telemetry/commands/cache/dangerously-delete-immutable-static';
import { isAPIError } from '../../util/errors-ts';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { outputActionRequired } from '../../util/agent-output';
import { canPrompt } from '../../util/can-prompt';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

export default async function dangerouslyDeleteImmutableStatic(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CacheDangerouslyDeleteImmutableStaticTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    dangerouslyDeleteImmutableStaticSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const [path] = parsedArgs.args;
  if (!path) {
    output.error(
      `Missing required argument. Usage: ${getCommandName('cache dangerously-delete-immutable-static <path>')}`
    );
    return 1;
  }
  telemetry.trackCliArgumentPath(path);

  const projectName = parsedArgs.flags['--project'];
  telemetry.trackCliOptionProject(projectName);

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `cache dangerously-delete-immutable-static ${path} ${globalFlags.join(' ')}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'Deleting an immutable static asset permanently removes it from storage and cannot be undone; its URL will serve 410 for 7 days, then 404. ' +
          'This cannot be confirmed non-interactively: the user must run this command in a terminal and type the asset path to confirm.',
        userActionRequired: true,
        hint: 'Surface this to the user; the confirmation cannot be automated.',
        next: [
          {
            command: interactiveCommand,
            when: 'user runs this command in an interactive terminal',
          },
        ],
      },
      1
    );
    output.error(
      'This command must be run interactively because it permanently deletes the asset from storage.'
    );
    return 1;
  }

  const link = await resolveProjectContext({
    client,
    projectNameOrId: projectName,
  });

  if (link.status === 'not_linked') {
    output.error(
      'No project linked. Run `vercel link` to link a project to this directory.'
    );
    return 1;
  }

  if (link.status === 'error') {
    return link.exitCode;
  }

  const { project, org } = link;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  output.print(
    prependEmoji(
      `Deleting immutable static asset ${path} for project ${project.name} permanently removes it from storage for the production and preview environments. This cannot be undone; its URL will serve 410 for 7 days, then 404.\n`,
      emoji('warning')
    )
  );
  const entered = await client.input.text({
    message: `Type ${path} to confirm the permanent deletion:`,
  });
  if (entered !== path) {
    output.log('Canceled');
    return 0;
  }

  try {
    await client.fetch(
      `/v1/edge-cache/dangerously-delete-immutable-static?projectIdOrName=${project.id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }
    );
  } catch (err) {
    if (isAPIError(err) && err.code === 'challenge_required') {
      output.error(
        `This action requires a recent authentication. Run ${getCommandName('login')} and retry.`
      );
      return 1;
    }
    throw err;
  }

  output.print(
    prependEmoji(
      `Successfully deleted immutable static asset ${path}; its URL now serves 410`,
      emoji('success')
    ) + `\n`
  );
  return 0;
}
