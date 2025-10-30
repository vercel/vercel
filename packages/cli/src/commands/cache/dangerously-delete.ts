import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { dangerouslyDeleteSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import { emoji, prependEmoji } from '../../util/emoji';
import { CacheDangerouslyDeleteTelemetryClient } from '../../util/telemetry/commands/cache/dangerously-delete';
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

  const link = await getLinkedProject(client);

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
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionTag(tag);
  telemetry.trackCliOptionSrcimg(srcimg);
  telemetry.trackCliOptionRevalidationDeadlineSeconds(revalidate);

  if (tag && srcimg) {
    output.error(`Cannot use both --tag and --srcimg options`);
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
  } else {
    output.error(`The --tag or --srcimg option is required`);
    return 1;
  }

  const msg = `You are about to dangerously delete all cached content associated with ${itemName} ${itemValue} for project ${project.name}`;

  if (!yes) {
    if (!process.stdin.isTTY) {
      const optional =
        typeof revalidate !== 'undefined'
          ? ` --revalidation-deadline-seconds ${revalidate}`
          : '';
      output.print(
        `${msg}. To continue, run ${getCommandName(`cache dangerously-delete ${flag} ${itemValue}${optional} --yes`)}.`
      );
      return 1;
    }
    const confirmed = await client.input.confirm(`${msg}. Continue?`, true);
    if (!confirmed) {
      output.print(`Canceled.\n`);
      return 0;
    }
  }

  await client.fetch(`${postUrl}?projectIdOrName=${project.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postBody),
  });

  output.print(
    prependEmoji(
      `Successfully deleted all cached content associated with ${itemName} ${itemValue}`,
      emoji('success')
    ) + `\n`
  );
  return 0;
}
