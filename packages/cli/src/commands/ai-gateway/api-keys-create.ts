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
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import {
  getRenamedOption,
  reportRenamedOptionError,
} from '../../util/renamed-option';
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
    return 2;
  }
  const { flags: opts } = parsedArgs;

  const name = opts['--name'] as string | undefined;
  const amountFlag = opts['--amount'] as number | undefined;
  const budgetFlag = opts['--budget'] as number | undefined;
  const limitFlag = opts['--limit'] as number | undefined;
  const refreshPeriod = opts['--refresh-period'] as string | undefined;
  const includeByok = opts['--include-byok'] as boolean | undefined;
  const alertThresholdsInput = opts['--alert-thresholds'] as string | undefined;
  const expiration = opts['--expiration'] as string | undefined;
  const zdrExempt = opts['--zdr-exempt'] as boolean | undefined;
  const bypassAll = opts['--bypass-all-settings'] as boolean | undefined;
  const tokenPass = opts['--token-pass'] as boolean | undefined;

  telemetry.trackCliOptionName(name);
  telemetry.trackCliOptionAmount(amountFlag);
  telemetry.trackCliOptionBudget(budgetFlag);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);
  telemetry.trackCliOptionAlertThresholds(alertThresholdsInput);
  telemetry.trackCliOptionExpiration(expiration);
  telemetry.trackCliFlagZdrExempt(zdrExempt);
  telemetry.trackCliFlagBypassAllSettings(bypassAll);
  telemetry.trackCliFlagTokenPass(tokenPass);

  if (tokenPass && (zdrExempt || bypassAll)) {
    const message =
      'Cannot combine --token-pass with --zdr-exempt or --bypass-all-settings. Remove the exemption options to create a Token Pass key.';
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        next: [
          {
            command: getCommandNamePlain(
              'ai-gateway api-keys create --token-pass'
            ),
          },
        ],
      },
      2
    );
    output.error(message);
    return 2;
  }

  if (budgetFlag !== undefined && limitFlag !== undefined) {
    const message =
      'Pass only one of --limit or --budget. (Both are deprecated; use --amount.)';
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_BUDGET,
        message,
        next: [
          {
            command: getCommandNamePlain(
              'ai-gateway api-keys create --amount 500'
            ),
          },
        ],
      },
      2
    );
    output.error(message);
    return 2;
  }
  // `--limit` and `--budget` are both old names of `--amount`, and the check
  // above keeps them apart.
  const amount = getRenamedOption<number>(
    opts,
    '--amount',
    budgetFlag !== undefined ? '--budget' : '--limit'
  );
  if ('error' in amount) {
    return reportRenamedOptionError(client, amount.error);
  }
  const budget = amount.value;

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
              'ai-gateway api-keys create --amount 500'
            ),
          },
        ],
      },
      2
    );
    output.error(message);
    return 2;
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
      2
    );
    output.error(message);
    return 2;
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
        2
      );
      output.error(message);
      return 2;
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
      2
    );
    output.error(message);
    return 2;
  }
  const expiresAt =
    expiration !== undefined ? presetToExpiresAt(expiration) : undefined;

  const aiGatewayQuota = buildQuota({
    budget,
    refreshPeriod,
    includeByok,
    alertThresholds,
  });

  if (!(await client.resolveCurrentTeam())) {
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
    ...(tokenPass && { tokenPass: true as const }),
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

    // Interim static copy: the computed notice listed every budget on the
    // team, which on large teams hung create for seconds to minutes (or 500'd
    // after the key existed). The computed notice returns once the budgets
    // list is fast.
    output.log(
      budget !== undefined
        ? `Spend on this key also counts toward any user and team budgets. List them with ${getCommandName('ai-gateway budgets list')}.`
        : `No key budget set. Spend still counts toward any API key default, user, and team budgets. List them with ${getCommandName('ai-gateway budgets list')}.`
    );

    if (client.isAgent) {
      output.log(
        `Prefer OIDC over long-lived API keys: code on Vercel can authenticate to AI Gateway with VERCEL_OIDC_TOKEN, and local development can get one with ${getCommandName('link')} and ${getCommandName('env pull')}. Revoke this key with ${getCommandName(`ai-gateway api-keys revoke ${result.apiKey.id} --yes`)} if you don't need it.`
      );
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
