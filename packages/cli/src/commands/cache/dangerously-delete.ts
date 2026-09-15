import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { dangerouslyDeleteSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { emoji, prependEmoji } from '../../util/emoji';
import { CacheDangerouslyDeleteTelemetryClient } from '../../util/telemetry/commands/cache/dangerously-delete';
import { isAPIError } from '../../util/errors-ts';
import plural from 'pluralize';

export default async function dangerouslyDelete(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CacheDangerouslyDeleteTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    dangerouslyDeleteSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

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
  const tag = parsedArgs.flags['--tag'];
  const srcimg = parsedArgs.flags['--srcimg'];
  const revalidate = parsedArgs.flags['--revalidation-deadline-seconds'];
  const immutableStaticPath = parsedArgs.flags['--immutable-static-path'];
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionTag(tag);
  telemetry.trackCliOptionSrcimg(srcimg);
  telemetry.trackCliOptionRevalidationDeadlineSeconds(revalidate);
  telemetry.trackCliOptionImmutableStaticPath(immutableStaticPath);

  if ([tag, srcimg, immutableStaticPath].filter(Boolean).length > 1) {
    output.error(
      `Can only use one of the --tag, --srcimg, and --immutable-static-path options`
    );
    return 1;
  }
  if (immutableStaticPath && typeof revalidate !== 'undefined') {
    output.error(
      `Cannot use --revalidation-deadline-seconds with --immutable-static-path`
    );
    return 1;
  }

  let itemName = '';
  let itemValue = '';
  let flag = '';
  let postUrl = '';
  let postBody = {};
  if (tag) {
    itemName = plural('tag', tag.split(',').length, false);
    itemValue = tag;
    flag = '--tag';
    postUrl = '/v1/edge-cache/dangerously-delete-by-tags';
    postBody = { tags: tag, revalidationDeadlineSeconds: revalidate };
  } else if (srcimg) {
    itemName = 'source image';
    itemValue = srcimg;
    flag = '--srcimg';
    postUrl = '/v1/edge-cache/dangerously-delete-by-src-images';
    postBody = { srcImages: [srcimg], revalidationDeadlineSeconds: revalidate };
  } else if (immutableStaticPath) {
    itemName = 'immutable static asset';
    itemValue = immutableStaticPath;
    flag = '--immutable-static-path';
    postUrl = '/v1/edge-cache/dangerously-delete-immutable-static';
    postBody = { path: immutableStaticPath };
  } else {
    output.error(
      `The --tag, --srcimg, or --immutable-static-path option is required`
    );
    return 1;
  }

  const msg = immutableStaticPath
    ? `You are about to permanently delete immutable static asset ${itemValue} from storage for project ${project.name}. This cannot be undone and its URL will serve 410 for 7 days`
    : `You are about to dangerously delete all cached content associated with ${itemName} ${itemValue} for project ${project.name}`;

  if (!yes) {
    if (!process.stdin.isTTY) {
      const projectFlag = projectName ? ` --project ${projectName}` : '';
      const optional =
        typeof revalidate !== 'undefined'
          ? ` --revalidation-deadline-seconds ${revalidate}`
          : '';
      output.print(
        `${msg}. To continue, run ${getCommandName(`cache dangerously-delete ${flag} ${itemValue}${projectFlag}${optional} --yes`)}.`
      );
      return 1;
    }
    const confirmed = await client.input.confirm(`${msg}. Continue?`, true);
    if (!confirmed) {
      output.print(`Canceled.\n`);
      return 0;
    }
  }

  try {
    await client.fetch(`${postUrl}?projectIdOrName=${project.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
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
      immutableStaticPath
        ? `Successfully deleted immutable static asset ${itemValue}; its URL now serves 410`
        : `Successfully deleted all cached content associated with ${itemName} ${itemValue}`,
      emoji('success')
    ) + `\n`
  );
  return 0;
}
