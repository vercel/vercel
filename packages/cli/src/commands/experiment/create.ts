import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { createFlag } from '../../util/flags/create-flag';
import { experimentCreateSubcommand } from './command';
import type {
  CreateFlagRequest,
  ExperimentAllocationUnit,
  FlagEnvironmentConfig,
  FlagVariant,
} from '../../util/flags/types';

function defaultProductionEnv(
  controlVariantId: string,
  treatmentVariantId: string
): Record<string, FlagEnvironmentConfig> {
  return {
    production: {
      active: true,
      pausedOutcome: { type: 'variant', variantId: controlVariantId },
      rules: [],
      fallthrough: {
        type: 'split',
        base: { type: 'visitor' },
        weights: { [controlVariantId]: 50, [treatmentVariantId]: 50 },
        defaultVariantId: controlVariantId,
      },
    },
  };
}

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    experimentCreateSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const slug = parsedArgs.args[0];
  if (!slug) {
    output.error(
      `Missing flag slug. Example: ${getCommandName('experiment create my-signup-test --primary-metric-id met_xxx --allocation-unit visitorId')}`
    );
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const primaryMetricIds =
    (parsedArgs.flags['--primary-metric-id'] as string[] | undefined) ?? [];
  const allocationUnit =
    (parsedArgs.flags['--allocation-unit'] as
      | ExperimentAllocationUnit
      | undefined) ?? 'visitorId';
  const hypothesis = parsedArgs.flags['--hypothesis'] as string | undefined;
  const experimentName = parsedArgs.flags['--name'] as string | undefined;
  const controlVariantId =
    (parsedArgs.flags['--control-variant'] as string | undefined) ?? 'control';
  const treatmentVariantId =
    (parsedArgs.flags['--treatment-variant'] as string | undefined) ??
    'treatment';
  const seedRaw = parsedArgs.flags['--seed'] as string | undefined;
  const seed =
    seedRaw !== undefined
      ? Number(seedRaw)
      : Math.floor(Math.random() * 100_001);

  if (primaryMetricIds.length === 0 || primaryMetricIds.length > 3) {
    output.error(
      'Provide 1–3 primary metrics with --primary-metric-id <id> (repeatable). Create metrics first with `vc experiment metrics add`.'
    );
    return 1;
  }

  if (!['cookieId', 'visitorId', 'userId'].includes(allocationUnit)) {
    output.error('--allocation-unit must be cookieId, visitorId, or userId');
    return 1;
  }

  if (!Number.isFinite(seed) || seed < 0 || seed > 100_000) {
    output.error('--seed must be a number from 0 to 100000');
    return 1;
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  const variants: FlagVariant[] = [
    {
      id: controlVariantId,
      value: { variantId: controlVariantId, params: {} },
    },
    {
      id: treatmentVariantId,
      value: { variantId: treatmentVariantId, params: {} },
    },
  ];

  const body: CreateFlagRequest = {
    slug,
    kind: 'json',
    seed,
    variants,
    environments: defaultProductionEnv(controlVariantId, treatmentVariantId),
    experiment: {
      name: experimentName,
      allocationUnit,
      primaryMetricIds,
      status: 'draft',
      hypothesis,
      controlVariantId,
    },
  };

  output.spinner(`Creating experiment flag ${slug}`);

  try {
    const flag = await createFlag(client, project.id, body);
    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify({ flag }, null, 2)}\n`);
    } else {
      output.log(
        `Draft experiment created on flag "${slug}". Start with \`${getCommandName(`experiment start ${slug}`)}\`.`
      );
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
