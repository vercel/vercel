import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { invalidateSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import { emoji, prependEmoji } from '../../util/emoji';
import { CacheInvalidateTelemetryClient } from '../../util/telemetry/commands/cache/invalidate';
import plural from 'pluralize';

export default async function invalidate(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CacheInvalidateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    invalidateSubcommand.options
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
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionTag(tag);
  telemetry.trackCliOptionSrcimg(srcimg);

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
    postUrl = '/v1/edge-cache/invalidate-by-tags';
    postBody = { tags: tag };
  } else if (srcimg) {
    itemName = 'source image';
    itemValue = srcimg;
    flag = '--srcimg';
    postUrl = '/v1/edge-cache/invalidate-by-src-images';
    postBody = { srcImages: [srcimg] };
  } else {
    output.error(`The --tag or --srcimg option is required`);
    return 1;
  }

  const msg = `You are about to invalidate all cached content associated with ${itemName} ${itemValue} for project ${project.name}`;

  if (!yes) {
    if (!process.stdin.isTTY) {
      output.print(
        `${msg}. To continue, run ${getCommandName(`cache invalidate ${flag} ${itemValue} --yes`)}.`
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
      `Successfully invalidated all cached content associated with ${itemName} ${itemValue}`,
      emoji('success')
    ) + `\n`
  );
  return 0;
}
