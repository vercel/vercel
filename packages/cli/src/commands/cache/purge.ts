import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { purgeSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import { emoji, prependEmoji } from '../../util/emoji';
import { CachePurgeTelemetryClient } from '../../util/telemetry/commands/cache/purge';

export default async function purge(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new CachePurgeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(purgeSubcommand.options);
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
  telemetry.trackCliFlagYes(yes);

  const type = parsedArgs.flags['--type'] || 'all';
  telemetry.trackCliOptionType(parsedArgs.flags['--type']);
  const cacheTypeMap = {
    cdn: 'the CDN cache',
    data: 'the Data cache',
    all: 'the CDN cache and Data cache',
  };
  const validTypes = Object.keys(cacheTypeMap);

  if (!validTypes.includes(type)) {
    output.error(
      `Invalid cache type "${type}". Valid types are: ${validTypes.join(', ')}`
    );
    return 1;
  }
  const typeDesciption = cacheTypeMap[type as keyof typeof cacheTypeMap];
  const msg = `You are about to purge ${typeDesciption} for project ${project.name}`;
  const query = new URLSearchParams({ projectIdOrName: project.id }).toString();

  if (!yes) {
    if (!process.stdin.isTTY) {
      output.print(
        `${msg}. To continue, run ${getCommandName('cache purge --yes')}.`
      );
      return 1;
    }
    const confirmed = await client.input.confirm(`${msg}. Continue?`, true);
    if (!confirmed) {
      output.print(`Canceled.\n`);
      return 0;
    }
  }

  const requests = [];

  if (type === 'cdn' || type === 'all') {
    requests.push(
      client.fetch(`/v1/edge-cache/purge-all?${query}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  }

  if (type === 'data' || type === 'all') {
    requests.push(
      client.fetch(`/v1/data-cache/purge-all?${query}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  }

  await Promise.all(requests);

  output.print(
    prependEmoji(`Successfully purged ${typeDesciption}`, emoji('success')) +
      `\n`
  );
  return 0;
}
