import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { dangerouslyDeleteImmutableStaticSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { emoji, prependEmoji } from '../../util/emoji';
import { CacheDangerouslyDeleteImmutableStaticTelemetryClient } from '../../util/telemetry/commands/cache/dangerously-delete-immutable-static';
import { isAPIError } from '../../util/errors-ts';

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
  const yes = Boolean(parsedArgs.flags['--yes']);
  telemetry.trackCliFlagYes(yes);

  const msg = `You are about to permanently delete immutable static asset ${path} from storage for project ${project.name}. This cannot be undone and its URL will serve 410 for 7 days`;

  if (!yes) {
    if (!process.stdin.isTTY) {
      const projectFlag = projectName ? ` --project ${projectName}` : '';
      output.print(
        `${msg}. To continue, run ${getCommandName(`cache dangerously-delete-immutable-static ${path}${projectFlag} --yes`)}.`
      );
      return 1;
    }
    const confirmed = await client.input.confirm(`${msg}. Continue?`, false);
    if (!confirmed) {
      output.print(`Canceled.\n`);
      return 0;
    }
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
