import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  getInferenceHooksConfig,
  INFERENCE_HOOK_FAILURE_MODES,
  INFERENCE_HOOK_MODES,
  putInferenceHooksConfig,
  type InferenceHookHeader,
  type InferenceHooksConfig,
  type InferenceHooksEntry,
  type InferenceHooksPutBody,
} from '../../util/ai-gateway/inference-hooks';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { remoteText } from '../../util/output/remote-text';
import { AiGatewayInferenceHooksSetTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { inferenceHooksSetSubcommand } from './command';
import {
  fail,
  formatConfigRows,
  groupCommand,
  GROUP,
  handleApiError,
  parseLeaf,
  printJson,
  printSteps,
  printWarnings,
  progress,
  readChoice,
  readEndpointUrl,
  readHeaders,
  readInteger,
  requireTeam,
  usageError,
  type Warning,
} from './inference-hooks-shared';

const PATH = `${GROUP} set`;

export const HEADERS_CLEARED_REASON = 'headers_cleared';

export default async function set(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewayInferenceHooksSetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const parsed = parseLeaf(
    client,
    argv,
    inferenceHooksSetSubcommand.options,
    PATH,
    telemetry
  );
  if (typeof parsed === 'number') return parsed;
  const { flags, json } = parsed;

  const headerValues = flags['--header'] as string[] | undefined;
  const clearHeaders = Boolean(flags['--clear-headers']);
  if (headerValues && clearHeaders) {
    return usageError(client, json, PATH, {
      message: "Can't use --header with --clear-headers.",
    });
  }

  const issues: Array<{ field: string; message: string }> = [];
  const changes: Partial<InferenceHooksEntry> = {
    endpointUrl: readEndpointUrl(
      flags['--endpoint-url'] as string | undefined,
      issues
    ),
    mode: readChoice(
      flags['--mode'] as string | undefined,
      'mode',
      INFERENCE_HOOK_MODES,
      issues
    ),
    failureMode: readChoice(
      flags['--failure-mode'] as string | undefined,
      'failure-mode',
      INFERENCE_HOOK_FAILURE_MODES,
      issues
    ),
    timeoutMs: readInteger(
      flags['--timeout-ms'] as number | undefined,
      'timeout-ms',
      1,
      10_000,
      issues
    ),
    rolloutPercent: readInteger(
      flags['--rollout-percent'] as number | undefined,
      'rollout-percent',
      0,
      100,
      issues
    ),
  };
  const headers: InferenceHookHeader[] | undefined = clearHeaders
    ? []
    : readHeaders(headerValues, issues);
  if (issues.length) {
    return usageError(client, json, PATH, {
      message: `Can't set inference hooks. ${issues.length} ${
        issues.length === 1 ? 'option is' : 'options are'
      } invalid.`,
      issues,
    });
  }
  const given = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined)
  ) as Partial<InferenceHooksEntry>;
  if (Object.keys(given).length === 0 && headers === undefined) {
    return usageError(client, json, PATH, {
      message: 'Nothing to set. Pass at least one option.',
    });
  }

  const team = await requireTeam(client, json, PATH);
  if (team !== true) return team;

  progress(client, json, 'Fetching inference hooks…');
  let current: InferenceHooksConfig;
  try {
    current = await getInferenceHooksConfig(client);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'read the inference hooks configuration',
    });
  }
  output.stopSpinner();

  if (!current.configured && given.endpointUrl === undefined) {
    return fail(client, json, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message:
        "Can't set up inference hooks without --endpoint-url. None are set up for this team yet.",
      next: [
        {
          command: 'set --endpoint-url <URL>',
          when: 'Pass the URL of the server that reviews requests',
          placeholders: ['<URL>'],
        },
      ],
    });
  }

  // The API replaces the whole entry, so unchanged fields are sent back as is.
  // A new config leaves unset fields to the API's defaults, and starts off.
  const body: InferenceHooksPutBody = {
    ...(current.configured
      ? {
          endpointUrl: current.endpointUrl,
          enabled: current.enabled,
          mode: current.mode,
          failureMode: current.failureMode,
          timeoutMs: current.timeoutMs,
          rolloutPercent: current.rolloutPercent,
        }
      : { endpointUrl: '', enabled: false }),
    ...given,
    ...(headers !== undefined ? { headers } : {}),
  };

  const warnings: Warning[] = [];
  const clearedNames =
    current.configured &&
    headers === undefined &&
    given.endpointUrl !== undefined &&
    given.endpointUrl !== current.endpointUrl
      ? (current.headers?.names ?? [])
      : [];
  if (clearedNames.length) {
    warnings.push({
      reason: HEADERS_CLEARED_REASON,
      message: `The endpoint URL changed, so the stored headers were cleared: ${clearedNames
        .map(remoteText)
        .join(', ')}. Pass them again with --header.`,
    });
  }

  progress(client, json, 'Saving inference hooks…');
  let saved: InferenceHooksConfig;
  try {
    saved = await putInferenceHooksConfig(client, body);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'save the inference hooks configuration',
      carriesSecret: Boolean(headers?.length),
      unknownOutcome: 'the inference hooks configuration was saved',
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, {
      inferenceHooks: saved,
      outcome: 'set',
      ...(warnings.length ? { warnings } : {}),
      next: [
        {
          command: groupCommand(client, 'status'),
          when: 'Check the configuration',
        },
      ],
    });
  }

  output.print(
    `${formatAlignedLabel('Set', 'inference hooks', { gutter: '✓' })}\n`
  );
  if (saved.configured) {
    output.print(`${formatConfigRows(saved).join('\n')}\n`);
  }
  printWarnings(warnings);
  if (saved.configured && !saved.enabled) {
    printSteps(client, [
      { command: 'enable', when: 'Turn on inference hooks' },
    ]);
  }
  return 0;
}
