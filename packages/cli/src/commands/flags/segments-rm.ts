import chalk from 'chalk';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  deleteSegment,
  getSegment,
  getSegments,
} from '../../util/flags/segments';
import output from '../../output-manager';
import { FlagsSegmentsRmTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import { segmentsRemoveSubcommand } from './command';

export default async function segmentsRm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSegmentsRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    segmentsRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  let segmentArg: string | undefined = args[0];
  const skipConfirmation = flags['--yes'] as boolean | undefined;

  telemetryClient.trackCliArgumentSegment(segmentArg);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: 'Your codebase is not linked to a project. Run link first.',
          next: [
            {
              command: buildCommandWithGlobalFlags(client.argv, 'link'),
              when: 'link the project',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    if (!segmentArg) {
      segmentArg = await resolveSegmentArg(client, project.id);
      if (!segmentArg) {
        return 1;
      }
    }

    output.spinner('Fetching segment...');
    const segment = await getSegment(client, project.id, segmentArg, false);
    output.stopSpinner();

    if (!skipConfirmation) {
      if (!client.stdin.isTTY) {
        output.error(
          'Missing required flag --yes. Use --yes to skip the confirmation prompt in non-interactive mode.'
        );
        return 1;
      }

      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.CONFIRMATION_REQUIRED,
            message: `Confirm deletion of segment ${segment.slug} by adding --yes.`,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `flags segments rm ${segmentArg} --yes`
                ),
                when: 'confirm and delete the segment',
              },
            ],
          },
          1
        );
        return 1;
      }

      const confirmed = await client.input.confirm(
        `Are you sure you want to delete segment ${chalk.bold(segment.slug)}?`,
        false
      );

      if (!confirmed) {
        output.log('Aborted');
        return 0;
      }
    }

    output.spinner('Deleting segment...');
    await deleteSegment(client, project.id, segmentArg);
    output.stopSpinner();

    output.success(`Feature flag segment ${chalk.bold(segment.slug)} deleted`);
  } catch (err) {
    output.stopSpinner();
    if (handleSegmentInUseError(client, err, segmentArg)) {
      return 1;
    }
    printError(err);
    return 1;
  }

  return 0;
}

type SegmentUsageReference = {
  id?: string;
  slug?: string;
  name?: string;
  label?: string;
};

function handleSegmentInUseError(
  client: Client,
  error: unknown,
  segmentArg: string | undefined
): boolean {
  if (!isAPIError(error) || error.code !== 'SEGMENT_IN_USE') {
    return false;
  }

  const usedBy = error.usedBy as
    | {
        flags?: SegmentUsageReference[];
        segments?: SegmentUsageReference[];
      }
    | undefined;
  const flags = usedBy?.flags ?? [];
  const segments = usedBy?.segments ?? [];
  const segment = segmentArg ?? '<segment>';
  const formatReferences = (references: SegmentUsageReference[]) =>
    references
      .map(reference => {
        const primary =
          reference.name ?? reference.label ?? reference.slug ?? reference.id;
        if (primary && reference.slug && reference.slug !== primary) {
          return `${primary} (${reference.slug})`;
        }
        return primary ?? 'Unknown reference';
      })
      .join(', ');
  const firstFlag = flags.find(reference => reference.slug || reference.id);
  const firstSegment = segments.find(
    reference => reference.slug || reference.id
  );
  const inspectSubcommand =
    firstFlag !== undefined
      ? `flags inspect ${firstFlag.slug ?? firstFlag.id}`
      : firstSegment !== undefined
        ? `flags segments inspect ${firstSegment.slug ?? firstSegment.id}`
        : undefined;
  const lines = [`Segment ${segment} is still in use and can't be deleted.`];

  if (flags.length > 0) {
    lines.push(`Used by feature flags: ${formatReferences(flags)}`);
  }
  if (segments.length > 0) {
    lines.push(`Used by segments: ${formatReferences(segments)}`);
  }

  const message = lines.join('\n');

  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.SEGMENT_IN_USE,
      message,
      next: [
        ...(inspectSubcommand
          ? [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  inspectSubcommand
                ),
                when: 'inspect one reference that still uses the segment',
              },
            ]
          : []),
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `flags segments rm ${segment} --yes`
          ),
          when: 'retry after removing all references',
        },
      ],
    },
    1
  );

  if (inspectSubcommand) {
    lines.push(
      '',
      `Run ${getCommandName(inspectSubcommand)} to inspect one reference, remove the segment from each rule, then try deleting the segment again.`
    );
  } else {
    lines.push(
      '',
      'Remove every flag or segment rule that references it, then try deleting the segment again.'
    );
  }

  output.error(lines.join('\n'));
  return true;
}

async function resolveSegmentArg(
  client: Client,
  projectId: string
): Promise<string | undefined> {
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'Please provide a segment slug or ID. Run `vercel flags segments ls` to list segments.',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'flags segments rm <segment> --yes'
            ),
            when: 'delete a segment by slug or ID',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'flags segments ls'
            ),
            when: 'list segments to find the slug or ID',
          },
        ],
      },
      1
    );
    return undefined;
  }

  if (!client.stdin.isTTY) {
    output.error('Please provide a segment slug or ID to delete');
    output.log(`Example: ${getCommandName('flags segments rm beta-users')}`);
    return undefined;
  }

  output.spinner('Fetching segments...');
  const segments = await getSegments(client, projectId);
  output.stopSpinner();

  if (segments.length === 0) {
    output.log('No feature flag segments found');
    return undefined;
  }

  return client.input.select({
    message: 'Select a segment to delete:',
    choices: segments.map(segment => ({
      name: `${segment.label} (${segment.slug})`,
      value: segment.slug,
    })),
  });
}
