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
  addSegmentValue,
  normalizeSegmentData,
  parseSegmentDataInput,
  parseSegmentRuleInput,
} from '../../util/flags/segment-input';
import { createSegment } from '../../util/flags/segments';
import { printSegmentDetails } from '../../util/flags/print-segment-details';
import output from '../../output-manager';
import { formatProject } from '../../util/projects/format-project';
import { FlagsSegmentsCreateTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import { segmentsCreateSubcommand } from './command';
import type { CreateSegmentRequest, SegmentData } from '../../util/flags/types';

export default async function segmentsCreate(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSegmentsCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    segmentsCreateSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [slug] = args;
  let label = flags['--label'] as string | undefined;
  const description = flags['--description'] as string | undefined;
  let hint = flags['--hint'] as string | undefined;
  const dataInput = flags['--data'] as string | undefined;
  const ruleInputs = (flags['--rule'] as string[] | undefined) ?? [];
  const includeInputs = (flags['--include'] as string[] | undefined) ?? [];
  const excludeInputs = (flags['--exclude'] as string[] | undefined) ?? [];
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliArgumentSlug(slug);
  telemetryClient.trackCliOptionLabel(label);
  telemetryClient.trackCliOptionDescription(description);
  telemetryClient.trackCliOptionHint(hint);
  telemetryClient.trackCliOptionData(dataInput);
  telemetryClient.trackCliOptionRule(ruleInputs);
  telemetryClient.trackCliOptionInclude(includeInputs);
  telemetryClient.trackCliOptionExclude(excludeInputs);
  telemetryClient.trackCliFlagJson(json);

  if (!slug) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: 'Please provide a segment slug to create.',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'flags segments create <slug> --label <label> --include user.id=<value>'
              ),
              when: 'create a segment with explicit values',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error('Please provide a slug for the segment');
    output.log(
      `Example: ${getCommandName('flags segments create beta-users --label "Beta users" --include user.id=user_123')}`
    );
    return 1;
  }

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

  label = await resolveSegmentLabel(client, label, slug);
  hint = await resolveSegmentHint(client, hint, description, label);

  let data: SegmentData;
  try {
    data = await collectSegmentData(client, {
      dataInput,
      ruleInputs,
      includeInputs,
      excludeInputs,
    });
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  const request: CreateSegmentRequest = {
    slug,
    label,
    description,
    data,
    hint,
  };

  try {
    output.spinner('Creating segment...');
    const segment = await createSegment(client, project.id, request);
    output.stopSpinner();

    if (json) {
      client.stdout.write(`${JSON.stringify({ segment }, null, 2)}\n`);
      return 0;
    }

    output.success(`Feature flag segment ${chalk.bold(segment.slug)} created`);
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

async function resolveSegmentLabel(
  client: Client,
  label: string | undefined,
  slug: string
): Promise<string> {
  const defaultLabel = humanizeSlug(slug);

  if (label) {
    return label;
  }

  if (client.stdin.isTTY && !client.nonInteractive) {
    const response = await client.input.text({
      message: `Enter a label for this segment (press Enter for "${defaultLabel}"):`,
    });
    return response.trim() || defaultLabel;
  }

  return defaultLabel;
}

async function resolveSegmentHint(
  client: Client,
  hint: string | undefined,
  description: string | undefined,
  label: string
): Promise<string> {
  if (hint) {
    return hint;
  }

  if (client.stdin.isTTY && !client.nonInteractive) {
    const response = await client.input.text({
      message: `Enter a hint for who belongs in this segment (press Enter for "${description || label}"):`,
    });
    return response.trim() || description || label;
  }

  return description || label;
}

async function collectSegmentData(
  client: Client,
  input: {
    dataInput?: string;
    ruleInputs: string[];
    includeInputs: string[];
    excludeInputs: string[];
  }
): Promise<SegmentData> {
  const hasExplicitData = Boolean(input.dataInput);
  const data = hasExplicitData
    ? parseSegmentDataInput(input.dataInput!)
    : normalizeSegmentData({});

  if (input.ruleInputs.length > 0) {
    data.rules = (data.rules ?? []).concat(
      input.ruleInputs.map(rule => parseSegmentRuleInput(rule))
    );
  }

  for (const includeInput of input.includeInputs) {
    addSegmentValue(data, 'include', includeInput);
  }
  for (const excludeInput of input.excludeInputs) {
    addSegmentValue(data, 'exclude', excludeInput);
  }

  if (
    !hasExplicitData &&
    input.ruleInputs.length === 0 &&
    input.includeInputs.length === 0 &&
    input.excludeInputs.length === 0 &&
    client.stdin.isTTY &&
    !client.nonInteractive
  ) {
    await collectSegmentDataInteractively(client, data);
  }

  return normalizeSegmentData(data);
}

async function collectSegmentDataInteractively(
  client: Client,
  data: SegmentData
) {
  let addAnother = await client.input.confirm(
    'Add segment criteria now?',
    true
  );

  while (addAnother) {
    const kind = await client.input.select<'include' | 'exclude' | 'rule'>({
      message: 'What do you want to add?',
      choices: [
        { name: 'Include an exact entity value', value: 'include' },
        { name: 'Exclude an exact entity value', value: 'exclude' },
        { name: 'Add a rule', value: 'rule' },
      ],
    });

    if (kind === 'rule') {
      const rule = await client.input.text({
        message:
          'Enter rule as ENTITY.ATTRIBUTE:OPERATOR:VALUE (for example user.email:ends-with:@vercel.com):',
      });
      data.rules = (data.rules ?? []).concat(parseSegmentRuleInput(rule));
    } else {
      const value = await client.input.text({
        message: `Enter ${kind} value as ENTITY.ATTRIBUTE=VALUE:`,
      });
      addSegmentValue(data, kind, value);
    }

    addAnother = await client.input.confirm('Add another criterion?', false);
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
