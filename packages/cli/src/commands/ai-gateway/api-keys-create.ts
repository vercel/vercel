import chalk from 'chalk';
import type Client from '../../util/client';
import {
  createApiKey,
  type ApiKeyMetadata,
} from '../../util/ai-gateway/api-keys';
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
import {
  buildQuota,
  isValidRefreshPeriod,
  parseAlertThresholds,
  VALID_ALERT_THRESHOLDS,
  VALID_REFRESH_PERIODS,
} from '../../util/ai-gateway/quota';
import {
  isValidExpiry,
  presetToExpiresAt,
  VALID_EXPIRY_VALUES,
} from '../../util/ai-gateway/expiry';
import {
  listBudgets,
  listScopeBudgetDefaults,
  formatBudgetCap,
} from '../../util/ai-gateway/budgets';
import getUser from '../../util/get-user';

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
  const alertThresholdsInput = opts['--alert-thresholds'] as string | undefined;
  const expiration = opts['--expiration'] as string | undefined;
  const zdrExempt = opts['--zdr-exempt'] as boolean | undefined;
  const bypassAll = opts['--bypass-all-settings'] as boolean | undefined;

  telemetry.trackCliOptionName(name);
  telemetry.trackCliOptionBudget(budget);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);
  telemetry.trackCliOptionAlertThresholds(alertThresholdsInput);
  telemetry.trackCliOptionExpiration(expiration);
  telemetry.trackCliFlagZdrExempt(zdrExempt);
  telemetry.trackCliFlagBypassAllSettings(bypassAll);

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

  if (refreshPeriod && !isValidRefreshPeriod(refreshPeriod)) {
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

  let alertThresholds: number[] | undefined;
  if (alertThresholdsInput !== undefined) {
    const result = parseAlertThresholds(alertThresholdsInput);
    if (!result.valid) {
      const message = `Invalid alert threshold "${result.invalid}". Must be a comma-separated subset of: ${VALID_ALERT_THRESHOLDS.join(', ')}.`;
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ALERT_THRESHOLDS,
          message,
          next: [
            {
              command: getCommandNamePlain(
                'ai-gateway api-keys create --alert-thresholds 50,75,100'
              ),
            },
          ],
        },
        1
      );
      output.error(message);
      return 1;
    }
    alertThresholds = result.values;
  }

  if (expiration !== undefined && !isValidExpiry(expiration)) {
    const message = `Invalid expiration "${expiration}". Must be one of: ${VALID_EXPIRY_VALUES.join(', ')}.`;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_EXPIRATION,
        message,
        next: [
          {
            command: getCommandNamePlain(
              'ai-gateway api-keys create --expiration 90d'
            ),
          },
        ],
      },
      1
    );
    output.error(message);
    return 1;
  }
  const expiresAt =
    expiration !== undefined ? presetToExpiresAt(expiration) : undefined;

  const aiGatewayQuota = buildQuota({
    budget,
    refreshPeriod,
    includeByok,
    alertThresholds,
  });

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

  // `bypassAll` subsumes `zdr` but both facts are kept when passed together.
  const metadata: ApiKeyMetadata = {
    ...(zdrExempt && { zdr: { enableNonZdrModels: true as const } }),
    ...(bypassAll && { bypassAll: true as const }),
  };

  try {
    const result = await createApiKey(client, {
      name,
      aiGatewayQuota,
      ...(expiresAt !== undefined && { expiresAt }),
      ...(Object.keys(metadata).length > 0 && { metadata }),
    });

    output.stopSpinner();

    client.stdout.write(`${result.apiKeyString}\n`);

    output.success(
      `API key ${chalk.bold(result.apiKey.name)} (${result.apiKey.id}) created ${createStamp()}`
    );

    // Name the caps that apply beyond the key's own budget.
    const caps = await inheritedCapsLine(client, {
      hasOwnBudget: budget !== undefined,
    });
    if (caps) {
      output.log(caps);
    }

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

// Best-effort: null when nothing applies or a lookup fails; never throws.
// An own budget overrides the api-key default; user and team caps always stack.
async function inheritedCapsLine(
  client: Client,
  { hasOwnBudget }: { hasOwnBudget: boolean }
): Promise<string | null> {
  try {
    const [defaults, budgets, user] = await Promise.all([
      listScopeBudgetDefaults(client),
      listBudgets(client),
      getUser(client),
    ]);

    const parts: string[] = [];

    const keyDefault = defaults.find(
      d => d.scopeType === 'api-key' && d.active !== false
    );
    if (keyDefault && !hasOwnBudget) {
      parts.push(
        `the API key default (${formatBudgetCap(keyDefault.limitAmount, keyDefault.refreshPeriod)})`
      );
    }

    const userBudget = budgets.find(
      b =>
        (b.scopeType as string) === 'user' &&
        b.active &&
        (b.scopeId === user.id || b.scopeId === `usr_${user.id}`)
    );
    if (userBudget) {
      parts.push(
        `your user budget (${formatBudgetCap(userBudget.limitAmount, userBudget.refreshPeriod)})`
      );
    } else {
      // New keys are user-attributed, so the user default covers the creator.
      const userDefault = defaults.find(
        d => d.scopeType === 'user' && d.active !== false
      );
      if (userDefault) {
        parts.push(
          `your user budget (${formatBudgetCap(userDefault.limitAmount, userDefault.refreshPeriod)} default)`
        );
      }
    }

    const teamBudget = budgets.find(b => b.scopeType === 'team' && b.active);
    if (teamBudget) {
      parts.push(
        `the team budget (${formatBudgetCap(teamBudget.limitAmount, teamBudget.refreshPeriod)})`
      );
    }

    if (parts.length === 0) {
      return null;
    }
    const list =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return hasOwnBudget
      ? `Spend on this key also counts toward ${list}.`
      : `No key budget set. Spend still counts toward ${list}.`;
  } catch (err: unknown) {
    // Under -d, a failed lookup stays distinguishable from "no caps apply".
    output.debug(
      `Skipping inherited-caps notice: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
