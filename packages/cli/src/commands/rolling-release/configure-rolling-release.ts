import ms from 'ms';
import type Client from '../../util/client';
import type {
  JSONObject,
  ProjectRollingRelease,
  RollingReleaseAdvancementType,
} from '@vercel-internals/types';
import output from '../../output-manager';
import { writeAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';

export type ConfigureResult =
  | { config: ProjectRollingRelease | undefined; exitCode?: undefined }
  | { config?: undefined; exitCode: number };

/**
 * Parses a duration string (e.g. "5m", "1h", "10") into minutes.
 * Returns undefined if the string is invalid or zero/negative.
 */
export function parseDuration(value: string): number | undefined {
  if (!value) {
    return undefined;
  }
  // Reject seconds and milliseconds — minimum granularity is minutes
  if (/^\d+(s|ms)$/i.test(value)) {
    return undefined;
  }
  // Treat bare numbers as minutes
  const milliseconds = ms(/^\d+$/.test(value) ? `${value}m` : value);
  if (milliseconds === undefined || milliseconds <= 0) {
    return undefined;
  }
  const minutes = Math.round(milliseconds / 60000);
  if (minutes <= 0) {
    return undefined;
  }
  return minutes;
}

function parseStageFlags(
  stageFlags: string[],
  advancementType: RollingReleaseAdvancementType
):
  | { stages: { targetPercentage: number; duration?: number }[]; error: null }
  | { stages: null; error: string } {
  const stages: { targetPercentage: number; duration?: number }[] = [];

  for (const stageValue of stageFlags) {
    const parts = stageValue.split(',');
    const percentage = parseInt(parts[0], 10);

    if (isNaN(percentage) || percentage < 1 || percentage > 99) {
      return {
        stages: null,
        error: `Invalid stage percentage "${parts[0]}". Must be a number between 1 and 99.`,
      };
    }

    if (parts.length > 1) {
      if (advancementType === 'manual-approval') {
        return {
          stages: null,
          error:
            'Duration must not be provided for stages when advancement type is "manual-approval".',
        };
      }
      const duration = parseDuration(parts[1]);
      if (duration === undefined) {
        return {
          stages: null,
          error: `Invalid duration "${parts[1]}". Use minutes (e.g. "5m"), hours (e.g. "1h"), or days (e.g. "1d"). Seconds are not supported.`,
        };
      }
      stages.push({ targetPercentage: percentage, duration });
    } else {
      if (advancementType === 'automatic') {
        return {
          stages: null,
          error:
            'Duration is required for each stage when advancement type is "automatic". Use the format "PERCENTAGE,DURATION" (e.g. "10,5m").',
        };
      }
      stages.push({ targetPercentage: percentage });
    }
  }

  for (let i = 1; i < stages.length; i++) {
    if (stages[i].targetPercentage <= stages[i - 1].targetPercentage) {
      return {
        stages: null,
        error: 'Stage percentages must be in ascending order.',
      };
    }
  }

  return { stages, error: null };
}

async function interactiveConfigure(client: Client): Promise<ConfigureResult> {
  const action = await client.input.select<'enable' | 'disable'>({
    message: 'Would you like to enable or disable rolling releases?',
    choices: [
      { name: 'Enable', value: 'enable' },
      { name: 'Disable', value: 'disable' },
    ],
  });

  if (action === 'disable') {
    return { config: undefined };
  }

  const advancementType =
    await client.input.select<RollingReleaseAdvancementType>({
      message: 'How should stages advance?',
      choices: [
        {
          name: 'automatic - Stages advance automatically after a set duration',
          value: 'automatic',
        },
        {
          name: 'manual-approval - Each stage requires manual approval to advance',
          value: 'manual-approval',
        },
      ],
    });

  const stages: { targetPercentage: number; duration?: number }[] = [];
  let stageNumber = 1;
  let addMore = true;

  while (addMore) {
    const percentageStr = await client.input.text({
      message: `Enter traffic percentage for stage ${stageNumber} (1-99):`,
      validate: (val: string) => {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1 || num > 99) {
          return 'Percentage must be a number between 1 and 99.';
        }
        if (
          stages.length > 0 &&
          num <= stages[stages.length - 1].targetPercentage
        ) {
          return `Percentage must be greater than the previous stage (${stages[stages.length - 1].targetPercentage}%).`;
        }
        return true;
      },
    });
    const percentage = parseInt(percentageStr, 10);

    let duration: number | undefined;
    if (advancementType === 'automatic') {
      const durationStr = await client.input.text({
        message: `Enter duration for this stage (e.g. 5m, 1h):`,
        validate: (val: string) => {
          const parsed = parseDuration(val);
          if (parsed === undefined) {
            return 'Invalid duration. Use minutes (e.g. "5m"), hours (e.g. "1h"), or days (e.g. "1d"). Seconds are not supported.';
          }
          return true;
        },
      });
      duration = parseDuration(durationStr);
    }

    stages.push({ targetPercentage: percentage, duration });
    stageNumber++;

    addMore = await client.input.confirm('Add another stage?', false);
  }

  output.log('');
  output.log('Rolling release configuration:');
  output.log(`  Advancement: ${advancementType}`);
  stages.forEach((stage, i) => {
    const durationText =
      stage.duration !== undefined ? ` for ${stage.duration} minutes` : '';
    output.log(`  Stage ${i + 1}: ${stage.targetPercentage}%${durationText}`);
  });
  output.log(`  Stage ${stages.length + 1}: 100% (final)`);
  output.log('');

  const confirmed = await client.input.confirm(
    'Apply this configuration?',
    true
  );
  if (!confirmed) {
    output.log('Configuration cancelled.');
    return { exitCode: 0 };
  }

  return {
    config: {
      enabled: true,
      advancementType,
      stages: [...stages, { targetPercentage: 100 }],
    },
  };
}

/**
 * Reports a usage error: one JSON error document with `--json`, otherwise a
 * human error.
 */
function failUsage(
  client: Client,
  jsonOutput: boolean,
  reason: string,
  message: string
): ConfigureResult {
  if (jsonOutput) {
    writeAgentError(client, { status: AGENT_STATUS.ERROR, reason, message });
  } else {
    output.error(message);
  }
  return { exitCode: 2 };
}

/**
 * Resolves the rolling release configuration from CLI flags or interactive prompts.
 *
 * Priority:
 * 1. --cfg (raw JSON, backwards compatible)
 * 2. --no-enable
 * 3. --enable + --advancement-type + --stage
 * 4. Interactive mode (TTY, no flags, no --json)
 * 5. Error (non-TTY, no flags)
 */
export async function buildConfigurePayload({
  client,
  cfgString,
  enableFlag,
  disableFlag,
  disableName = '--no-enable',
  advancementType,
  stageFlags,
  jsonOutput = false,
}: {
  client: Client;
  cfgString: string | undefined;
  enableFlag: boolean | undefined;
  /** `--no-enable`, or its hidden old name `--disable`. */
  disableFlag: boolean | undefined;
  /** Which of the two was typed, for the conflict error. */
  disableName?: '--no-enable' | '--disable';
  advancementType: string | undefined;
  stageFlags: string[] | undefined;
  jsonOutput?: boolean;
}): Promise<ConfigureResult> {
  if (cfgString !== undefined) {
    if (cfgString === 'disable') {
      return { config: undefined };
    }
    try {
      const cfg = JSON.parse(cfgString);
      return { config: cfg };
    } catch {
      return failUsage(
        client,
        jsonOutput,
        AGENT_REASON.INVALID_ARGUMENTS,
        'Invalid JSON provided for --cfg option.'
      );
    }
  }

  if (disableFlag) {
    if (enableFlag) {
      return failUsage(
        client,
        jsonOutput,
        AGENT_REASON.INVALID_ARGUMENTS,
        `Can't use --enable with ${disableName}.`
      );
    }
    return { config: undefined };
  }

  if (enableFlag) {
    if (
      advancementType !== 'automatic' &&
      advancementType !== 'manual-approval'
    ) {
      return failUsage(
        client,
        jsonOutput,
        'missing_flags',
        '--advancement-type is required when using --enable. Must be "automatic" or "manual-approval".'
      );
    }

    if (!stageFlags || stageFlags.length === 0) {
      return failUsage(
        client,
        jsonOutput,
        'missing_flags',
        'At least one --stage is required when using --enable.'
      );
    }

    const parsed = parseStageFlags(stageFlags, advancementType);
    if (parsed.error !== null) {
      return failUsage(
        client,
        jsonOutput,
        AGENT_REASON.INVALID_ARGUMENTS,
        parsed.error
      );
    }

    return {
      config: {
        enabled: true,
        advancementType,
        stages: [...parsed.stages, { targetPercentage: 100 }],
      },
    };
  }

  const hasAnyFlags =
    advancementType !== undefined ||
    (stageFlags !== undefined && stageFlags.length > 0);

  if (hasAnyFlags) {
    return failUsage(
      client,
      jsonOutput,
      'missing_flags',
      '--enable or --no-enable is required when using --advancement-type or --stage options.'
    );
  }

  // `--json` turns off prompts, so it needs the same explicit flags.
  if (client.nonInteractive || jsonOutput) {
    return failUsage(
      client,
      jsonOutput,
      'missing_flags',
      'In non-interactive mode use --enable or --no-enable with --advancement-type and --stage as needed. ' +
        'Example: vercel rolling-release update --enable --advancement-type=automatic --stage=10,5m --stage=50,10m'
    );
  }

  if (client.stdin.isTTY) {
    return interactiveConfigure(client);
  }

  return failUsage(
    client,
    jsonOutput,
    'missing_flags',
    'Missing configuration options. Use --enable or --no-enable with --advancement-type and --stage, or run interactively in a terminal.'
  );
}

/**
 * Configures rolling release settings for a project.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} teamId - The team to request the rolling release for
 * @param {ProjectRollingRelease} rollingReleaseConfig - The rolling release configuration to store.
 * @param {boolean} jsonOutput - Print the applied configuration as JSON instead of a receipt
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function configureRollingRelease({
  client,
  projectId,
  teamId,
  rollingReleaseConfig,
  jsonOutput = false,
}: {
  client: Client;
  projectId: string;
  teamId: string;
  rollingReleaseConfig: ProjectRollingRelease | undefined;
  jsonOutput?: boolean;
}): Promise<number> {
  const body = {
    ...rollingReleaseConfig,
    enabled: Boolean(rollingReleaseConfig),
  };

  await client.fetch(
    `/v1/projects/${projectId}/rolling-release/config?teamId=${teamId}`,
    {
      body: body as JSONObject,
      json: true,
      method: 'PATCH',
    }
  );

  if (jsonOutput) {
    client.stdout.write(
      `${JSON.stringify(
        { rollingReleaseConfig: body, outcome: 'updated' },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (rollingReleaseConfig) {
    output.log('Successfully updated rolling releases.');
  } else {
    output.log('Successfully disabled rolling releases.');
  }

  return 0;
}
