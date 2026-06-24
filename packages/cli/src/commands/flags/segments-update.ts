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
  applySegmentOperations,
  buildSegmentOperations,
  buildSegmentRuleOperations,
  buildSegmentTargetOperations,
  normalizeSegmentData,
  parseSegmentDataInput,
  parseSegmentRuleInput,
} from '../../util/flags/segment-input';
import {
  getSegment,
  getSegments,
  updateSegment,
} from '../../util/flags/segments';
import { printSegmentDetails } from '../../util/flags/print-segment-details';
import output from '../../output-manager';
import { formatProject } from '../../util/projects/format-project';
import { FlagsSegmentsUpdateTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import { segmentsUpdateSubcommand } from './command';
import type {
  Segment,
  SegmentData,
  SegmentMembershipOperation,
  SegmentOperation,
  UpdateSegmentRequest,
} from '../../util/flags/types';

export default async function segmentsUpdate(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSegmentsUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    segmentsUpdateSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  let segmentArg: string | undefined = args[0];
  const label = flags['--label'] as string | undefined;
  const description = flags['--description'] as string | undefined;
  const hint = flags['--hint'] as string | undefined;
  const dataInput = flags['--data'] as string | undefined;
  const addInputs = (flags['--add'] as string[] | undefined) ?? [];
  const removeInputs = (flags['--remove'] as string[] | undefined) ?? [];
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliArgumentSegment(segmentArg);
  telemetryClient.trackCliOptionLabel(label);
  telemetryClient.trackCliOptionDescription(description);
  telemetryClient.trackCliOptionHint(hint);
  telemetryClient.trackCliOptionData(dataInput);
  telemetryClient.trackCliOptionAdd(addInputs);
  telemetryClient.trackCliOptionRemove(removeInputs);
  telemetryClient.trackCliFlagJson(json);

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

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);

  try {
    if (!segmentArg) {
      segmentArg = await resolveSegmentArg(client, project.id);
      if (!segmentArg) {
        return 1;
      }
    }

    const operations = buildOperations({
      addInputs,
      removeInputs,
    });
    const hasChanges =
      label !== undefined ||
      description !== undefined ||
      hint !== undefined ||
      Boolean(dataInput) ||
      operations.length > 0;

    let request: UpdateSegmentRequest;
    if (!hasChanges && client.stdin.isTTY && !client.nonInteractive) {
      output.spinner('Fetching segment...');
      const segment = await getSegment(client, project.id, segmentArg, true);
      output.stopSpinner();
      request = await collectUpdateInteractively(client, segment);
    } else {
      request = await buildUpdateRequest(client, project.id, segmentArg, {
        label,
        description,
        hint,
        dataInput,
        operations,
      });
    }

    if (!hasUpdateRequestChanges(request)) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message:
              'Please provide at least one segment update option, such as --label, --data, --add, or --remove.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'flags segments update <segment> --add include:user.id=<value>'
                ),
                when: 'add a value to a segment',
              },
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'flags segments update <segment> --remove include:user.id=<value>'
                ),
                when: 'remove a value from a segment',
              },
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'flags segments inspect <segment> --json'
                ),
                when: 'inspect the current segment data first',
              },
            ],
          },
          1
        );
        return 1;
      }
      output.warn('No segment changes were provided');
      return 0;
    }

    output.spinner('Updating segment...');
    const segment = await updateSegment(
      client,
      project.id,
      segmentArg,
      request
    );
    output.stopSpinner();

    if (json) {
      client.stdout.write(`${JSON.stringify({ segment }, null, 2)}\n`);
      return 0;
    }

    output.success(`Feature flag segment ${chalk.bold(segment.slug)} updated`);
    printSegmentDetails({
      segment,
      projectSlugLink,
      showTimestamps: false,
    });
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
              'flags segments update <segment> --add include:user.id=<value>'
            ),
            when: 'update a segment by slug or ID',
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
    output.error('Please provide a segment slug or ID to update');
    output.log(
      `Example: ${getCommandName('flags segments update beta-users --add include:user.id=user_123')}`
    );
    return undefined;
  }

  output.spinner('Fetching segments...');
  const segments = await getSegments(client, projectId, true);
  output.stopSpinner();

  if (segments.length === 0) {
    output.error('No feature flag segments found');
    output.log(
      `Create one with: ${getCommandName('flags segments create beta-users --label "Beta users" --add include:user.id=user_123')}`
    );
    return undefined;
  }

  return client.input.select({
    message: 'Select a segment to update:',
    choices: segments.map(segment => ({
      name: `${segment.label} (${segment.slug})`,
      value: segment.slug,
    })),
  });
}

async function buildUpdateRequest(
  client: Client,
  projectId: string,
  segmentArg: string,
  input: {
    label?: string;
    description?: string;
    hint?: string;
    dataInput?: string;
    operations: SegmentOperation[];
  }
): Promise<UpdateSegmentRequest> {
  const request: UpdateSegmentRequest = {};
  if (input.label !== undefined) {
    request.label = input.label;
  }
  if (input.description !== undefined) {
    request.description = input.description;
  }
  if (input.hint !== undefined) {
    request.hint = input.hint;
  }

  if (input.dataInput) {
    request.data = parseSegmentDataInput(input.dataInput);
  }

  if (request.data) {
    request.data = applySegmentOperations(request.data, input.operations);
  } else if (hasRuleOperations(input.operations)) {
    output.spinner('Fetching segment...');
    const segment = await getSegment(client, projectId, segmentArg, true);
    output.stopSpinner();
    request.data = applySegmentOperations(segment.data, input.operations);
  } else if (input.operations.length > 0) {
    if (hasRemoveOperations(input.operations)) {
      output.spinner('Fetching segment...');
      const segment = await getSegment(client, projectId, segmentArg, true);
      output.stopSpinner();
      applySegmentOperations(segment.data, input.operations);
    }
    request.operations = input.operations.filter(isMembershipOperation);
  }

  return request;
}

function buildOperations(input: {
  addInputs: string[];
  removeInputs: string[];
}): SegmentOperation[] {
  return [
    ...buildSegmentTargetOperations('add', input.addInputs),
    ...buildSegmentTargetOperations('remove', input.removeInputs),
  ];
}

function hasRuleOperations(operations: SegmentOperation[]): boolean {
  return operations.some(operation => operation.field === 'rule');
}

function hasRemoveOperations(operations: SegmentOperation[]): boolean {
  return operations.some(operation => operation.action === 'remove');
}

function isMembershipOperation(
  operation: SegmentOperation
): operation is SegmentMembershipOperation {
  return operation.field === 'include' || operation.field === 'exclude';
}

async function collectUpdateInteractively(
  client: Client,
  segment: Segment
): Promise<UpdateSegmentRequest> {
  const request: UpdateSegmentRequest = {};
  let data: SegmentData | undefined;
  let replacingRules = false;
  const operations: SegmentOperation[] = [];
  let keepEditing = true;

  while (keepEditing) {
    const action = await client.input.select<
      | 'label'
      | 'description'
      | 'hint'
      | 'replace-rules'
      | 'add-rule'
      | 'remove-rule'
      | 'include'
      | 'exclude'
      | 'remove-include'
      | 'remove-exclude'
      | 'data'
      | 'done'
    >({
      message: 'What do you want to update?',
      choices: [
        { name: 'Label', value: 'label' },
        { name: 'Description', value: 'description' },
        { name: 'Hint', value: 'hint' },
        { name: 'Add rule', value: 'add-rule' },
        { name: 'Remove rule', value: 'remove-rule' },
        { name: 'Replace all rules', value: 'replace-rules' },
        { name: 'Add include value', value: 'include' },
        { name: 'Add exclude value', value: 'exclude' },
        { name: 'Remove include value', value: 'remove-include' },
        { name: 'Remove exclude value', value: 'remove-exclude' },
        { name: 'Replace full data JSON', value: 'data' },
        { name: 'Done', value: 'done' },
      ],
    });

    switch (action) {
      case 'label':
        request.label = await client.input.text({
          message: `Enter a new label (current: ${segment.label}):`,
        });
        break;
      case 'description':
        request.description = await client.input.text({
          message: 'Enter a new description:',
        });
        break;
      case 'hint':
        request.hint = await client.input.text({
          message: `Enter a new hint (current: ${segment.hint}):`,
        });
        break;
      case 'add-rule': {
        const rule = await client.input.text({
          message: 'Enter rule as ENTITY.ATTRIBUTE:OPERATOR:VALUE:',
        });
        operations.push(...buildSegmentRuleOperations('add', [rule]));
        break;
      }
      case 'remove-rule': {
        const rule = await client.input.text({
          message: 'Enter rule as ENTITY.ATTRIBUTE:OPERATOR:VALUE or rule ID:',
        });
        operations.push(...buildSegmentRuleOperations('remove', [rule]));
        break;
      }
      case 'replace-rules': {
        const rule = await client.input.text({
          message:
            'Enter rule as ENTITY.ATTRIBUTE:OPERATOR:VALUE (repeat by choosing this again):',
        });
        if (!replacingRules) {
          data = normalizeSegmentData({
            ...segment.data,
            rules: [],
          });
          replacingRules = true;
        }
        data = normalizeSegmentData(data ?? segment.data);
        data.rules = (data.rules ?? []).concat(parseSegmentRuleInput(rule));
        break;
      }
      case 'include':
      case 'exclude':
      case 'remove-include':
      case 'remove-exclude': {
        const value = await client.input.text({
          message: 'Enter value as ENTITY.ATTRIBUTE=VALUE:',
        });
        operations.push(
          ...buildSegmentOperations(
            action.includes('include') ? 'include' : 'exclude',
            action.startsWith('remove') ? 'remove' : 'add',
            [value]
          )
        );
        break;
      }
      case 'data': {
        const value = await client.input.text({
          message: 'Enter full segment data JSON:',
        });
        data = parseSegmentDataInput(value);
        break;
      }
      case 'done':
        keepEditing = false;
        break;
    }

    if (keepEditing) {
      keepEditing = await client.input.confirm('Make another change?', false);
    }
  }

  if (data) {
    request.data = applySegmentOperations(data, operations);
  } else if (hasRuleOperations(operations)) {
    request.data = applySegmentOperations(segment.data, operations);
  } else if (operations.length > 0) {
    request.operations = operations.filter(isMembershipOperation);
  }

  return request;
}

function hasUpdateRequestChanges(request: UpdateSegmentRequest): boolean {
  return (
    request.label !== undefined ||
    request.description !== undefined ||
    request.hint !== undefined ||
    request.data !== undefined ||
    Boolean(request.operations?.length)
  );
}
