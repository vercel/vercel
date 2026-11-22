import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { dangerouslyDeleteImmutableStaticAssetSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { emoji, prependEmoji } from '../../util/emoji';
import { ProjectDangerouslyDeleteImmutableStaticAssetTelemetryClient } from '../../util/telemetry/commands/project/dangerously-delete-immutable-static-asset';
import { isAPIError } from '../../util/errors-ts';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { quoteArg } from '../../util/flags/quote-arg';
import { outputActionRequired } from '../../util/agent-output';
import { canPrompt } from '../../util/can-prompt';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

export default async function dangerouslyDeleteImmutableStaticAsset(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry =
    new ProjectDangerouslyDeleteImmutableStaticAssetTelemetryClient({
      opts: {
        store: client.telemetryEventStore,
      },
    });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    dangerouslyDeleteImmutableStaticAssetSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const [path] = parsedArgs.args;
  if (!path) {
    output.error(
      `Missing required argument. Usage: ${getCommandName('project dangerously-delete-immutable-static-asset <path>')}`
    );
    return 2;
  }
  telemetry.trackCliArgumentPath(path);

  const projectName = parsedArgs.flags['--project'];
  telemetry.trackCliOptionProject(projectName);

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

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      // Prefix match: the `--non-interactive=true` spelling must not survive
      // into the suggested interactive re-run.
      flag => !flag.startsWith('--non-interactive')
    );
    // Pin the resolved project so the suggested re-run cannot resolve to a
    // different project when run from another directory.
    const interactiveCommand = getCommandNamePlain(
      `project dangerously-delete-immutable-static-asset ${quoteArg(path)} --project ${quoteArg(project.id)} ${globalFlags.map(quoteArg).join(' ')}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'Deleting an immutable static asset permanently removes it from storage and cannot be undone. ' +
          'This cannot be confirmed non-interactively. The user must run this command in a terminal and type the asset path to confirm.',
        userActionRequired: true,
        hint: 'This action can not be automated so it should be surfaced to the user.',
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

  output.print(
    prependEmoji(
      `Deleting immutable static asset ${path} for project ${project.name} permanently removes it from storage for the production and preview environments. This cannot be undone. Requests to this URL will serve 410 for 7 days and then 404.\n`,
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
        // The delete is not idempotent: a lost response may follow a
        // successful deletion, and a retry would report it as not-found.
        retry: { retries: 0 },
      }
    );
  } catch (err) {
    if (isAPIError(err)) {
      if (err.code === 'challenge_required') {
        output.error(
          `This action requires a recent authentication. Run ${getCommandName('login')} and retry.`
        );
        return 1;
      }
      if (err.status === 404) {
        // asset_not_found carries a useful server message (exact-path and
        // basePath caveats); the flag-gated bare not_found does not.
        output.error(
          err.code === 'asset_not_found' && err.serverMessage
            ? err.serverMessage
            : 'Project or asset not found.'
        );
        return 1;
      }
      if (err.status === 400) {
        output.error(err.serverMessage || 'Invalid request.');
        return 1;
      }
      if (err.status === 403) {
        output.error(
          err.serverMessage ||
            'You do not have permission to delete this asset.'
        );
        return 1;
      }
    }
    printError(err);
    output.log(
      'The deletion outcome is unknown. Re-run to verify: a not-found response on re-run means this attempt succeeded and the URL now serves 410.'
    );
    return 1;
  }

  output.print(
    prependEmoji(
      `Successfully deleted immutable static asset ${path}; its URL now serves 410`,
      emoji('success')
    ) + `\n`
  );
  return 0;
}
