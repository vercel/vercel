import chalk from 'chalk';
import type Client from '../../util/client';
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
    const segment = await getSegment(client, project.id, segmentArg, true);
    output.stopSpinner();

    if ((segment.usedByFlags?.length ?? 0) > 0) {
      output.warn(
        `Segment ${chalk.bold(segment.slug)} is used by ${segment.usedByFlags!.length} feature flag${segment.usedByFlags!.length === 1 ? '' : 's'}`
      );
    }

    if (!skipConfirmation) {
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
    printError(err);
    return 1;
  }

  return 0;
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
  const segments = await getSegments(client, projectId, true);
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
