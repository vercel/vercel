import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getSegments } from '../../util/flags/segments';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { formatProject } from '../../util/projects/format-project';
import { FlagsSegmentsLsTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import { segmentsListSubcommand } from './command';
import type { Segment } from '../../util/flags/types';

export default async function segmentsLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSegmentsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    segmentsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const json = parsedArgs.flags['--json'] as boolean | undefined;
  telemetryClient.trackCliFlagJson(json);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);
  const lsStamp = stamp();

  output.spinner(`Fetching feature flag segments for ${projectSlugLink}`);

  try {
    const segments = await getSegments(client, project.id, true);
    output.stopSpinner();

    const sortedSegments = segments.sort((a, b) => b.updatedAt - a.updatedAt);

    if (json) {
      outputJson(client, sortedSegments);
    } else if (segments.length === 0) {
      output.log(
        `No feature flag segments found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
      );
      output.log(
        `\nCreate one with: ${getCommandName('flags segments create beta-users --label "Beta users" --add include:user.id=user_123')}`
      );
    } else {
      output.log(
        `${plural('feature flag segment', segments.length, true)} found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
      );
      printSegmentsTable(sortedSegments);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function outputJson(client: Client, segments: Segment[]) {
  const jsonOutput = {
    segments: segments.map(segment => ({
      id: segment.id,
      slug: segment.slug,
      label: segment.label,
      description: segment.description ?? null,
      data: segment.data,
      hint: segment.hint,
      usedByFlags: segment.usedByFlags ?? [],
      usedBySegments: segment.usedBySegments ?? [],
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    })),
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function printSegmentsTable(segments: Segment[]) {
  const headers = ['Slug', 'Label', 'Rules', 'Values', 'Used By', 'Updated'];
  const now = Date.now();

  const rows = segments.map(segment => [
    chalk.bold(segment.slug),
    segment.label,
    String(segment.data.rules?.length ?? 0),
    String(countSegmentValues(segment)),
    String(
      (segment.usedByFlags?.length ?? 0) + (segment.usedBySegments?.length ?? 0)
    ),
    ms(now - segment.updatedAt) + ' ago',
  ]);

  const table = formatTable(
    headers,
    ['l', 'l', 'r', 'r', 'r', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}

function countSegmentValues(segment: Segment): number {
  return (
    countMembershipValues(segment.data.include) +
    countMembershipValues(segment.data.exclude)
  );
}

function countMembershipValues(
  map: Segment['data']['include'] | Segment['data']['exclude']
): number {
  if (!map) {
    return 0;
  }

  return Object.values(map).reduce(
    (sum, attributes) =>
      sum +
      Object.values(attributes).reduce(
        (attributeSum, values) => attributeSum + values.length,
        0
      ),
    0
  );
}
