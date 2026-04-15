import chalk from 'chalk';
import type Client from '../../util/client';
import createApiKeyRequest from '../../util/ai-gateway/create-api-key';
import selectOrg from '../../util/input/select-org';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayApiKeysCreateTelemetryClient } from '../../util/telemetry/commands/ai-gateway/api-keys-create';
import { createSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import type { AiGatewayQuota } from '../../util/ai-gateway/create-api-key';

const VALID_REFRESH_PERIODS = ['daily', 'weekly', 'monthly', 'none'] as const;

export default async function create(client: Client, argv: string[]) {
  const telemetry = new AiGatewayApiKeysCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(createSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const name = opts['--name'] as string | undefined;
  const budget = opts['--budget'] as number | undefined;
  const refreshPeriod = opts['--refresh-period'] as string | undefined;
  const includeByok = opts['--include-byok'] as boolean | undefined;

  // Track telemetry
  telemetry.trackCliOptionName(name);
  telemetry.trackCliOptionBudget(budget);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);

  // Validate --budget if provided
  if (budget !== undefined && budget < 1) {
    const message = 'Budget must be a positive number in dollars (minimum 1).';
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_BUDGET,
        message,
        next: [
          {
            command: getCommandNamePlain(
              'ai-gateway api-keys create --budget 500'
            ),
          },
        ],
      },
      1
    );
    output.error(message);
    return 1;
  }

  // Validate --refresh-period if provided
  if (
    refreshPeriod &&
    !VALID_REFRESH_PERIODS.includes(
      refreshPeriod as (typeof VALID_REFRESH_PERIODS)[number]
    )
  ) {
    const message = `Invalid refresh period "${refreshPeriod}". Must be one of: ${VALID_REFRESH_PERIODS.join(', ')}.`;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_REFRESH_PERIOD,
        message,
        next: [
          {
            command: getCommandNamePlain(
              'ai-gateway api-keys create --refresh-period monthly'
            ),
          },
        ],
      },
      1
    );
    output.error(message);
    return 1;
  }

  // Build aiGatewayQuota only when any quota flag is provided
  const effectiveRefreshPeriod =
    refreshPeriod && refreshPeriod !== 'none' ? refreshPeriod : undefined;
  const aiGatewayQuota: AiGatewayQuota | undefined =
    budget !== undefined || effectiveRefreshPeriod || includeByok
      ? {
          ...(budget !== undefined && { limitAmount: budget }),
          ...(effectiveRefreshPeriod && {
            refreshPeriod: effectiveRefreshPeriod,
          }),
          ...(includeByok && { includeByokInQuota: true }),
        }
      : undefined;

  // Ensure a team is selected; fail in non-interactive/piped mode if missing
  if (!client.config.currentTeam) {
    if (!client.stdin.isTTY) {
      output.error(
        'No team selected. Use `vercel --scope <team-slug> ai-gateway api-keys create` or run `vercel switch` first.'
      );
      return 1;
    }
    const org = await selectOrg(client, 'Which team should own this API key?');
    if (org.type === 'team') {
      client.config.currentTeam = org.id;
    }
  }

  const createStamp = stamp();

  output.spinner('Creating API key');

  try {
    const result = await createApiKeyRequest(client, {
      name,
      aiGatewayQuota,
    });

    output.stopSpinner();

    // Print the API key to stdout so it can be piped
    client.stdout.write(`${result.apiKeyString}\n`);

    // Print metadata to stderr for interactive users
    output.success(
      `API key ${chalk.bold(result.apiKey.name)} (${result.apiKey.id}) created ${createStamp()}`
    );

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
