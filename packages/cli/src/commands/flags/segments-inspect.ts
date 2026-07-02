import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getSegment } from '../../util/flags/segments';
import { printSegmentDetails } from '../../util/flags/print-segment-details';
import output from '../../output-manager';
import { formatProject } from '../../util/projects/format-project';
import { FlagsSegmentsInspectTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import { segmentsInspectSubcommand } from './command';

export default async function segmentsInspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSegmentsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    segmentsInspectSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [segmentArg] = args;
  const json = flags['--json'] as boolean | undefined;

  if (!segmentArg) {
    output.error('Please provide a segment slug or ID to inspect');
    output.log(
      `Example: ${getCommandName('flags segments inspect beta-users')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentSegment(segmentArg);
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

  try {
    output.spinner('Fetching segment...');
    const segment = await getSegment(client, project.id, segmentArg, true);
    output.stopSpinner();

    if (json) {
      client.stdout.write(`${JSON.stringify({ segment }, null, 2)}\n`);
    } else {
      printSegmentDetails({
        segment,
        projectSlugLink,
      });
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
