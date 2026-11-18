import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  getInferenceHooksConfig,
  testInferenceHookConnection,
  type ConnectionTestResult,
  type InferenceHooksConfig,
} from '../../util/ai-gateway/inference-hooks';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { remoteText } from '../../util/output/remote-text';
import { AiGatewayInferenceHooksTestTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { inferenceHooksTestSubcommand } from './command';
import {
  fail,
  GROUP,
  handleApiError,
  type NextStep,
  parseLeaf,
  printJson,
  printSteps,
  printWarnings,
  progress,
  readEndpointUrl,
  readHeaders,
  readInteger,
  requireTeam,
  usageError,
  type Warning,
} from './inference-hooks-shared';

const PATH = `${GROUP} test`;

/** Why a test failed, in CLI words. An unknown `failure` is shown as is. */
const FAILURES: Record<string, string> = {
  not_enabled: "Inference hooks aren't available for this team yet.",
  flag_unavailable:
    "AI Gateway couldn't check whether inference hooks are available for this team.",
  url_rejected: "AI Gateway doesn't accept this endpoint URL.",
  private_address: 'The endpoint URL points to a private address.',
  timeout: "The endpoint didn't answer within the timeout.",
  transport_error: "AI Gateway couldn't connect to the endpoint.",
  unparseable_response: "The endpoint's answer isn't a valid verdict.",
  secret_missing: "This team doesn't have a signing secret.",
  secret_unavailable: "AI Gateway couldn't load the signing secret.",
  internal_error: 'AI Gateway hit an internal error.',
};

const FAILURE_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function describeFailure(
  result: Extract<ConnectionTestResult, { ok: false }>
): string {
  if (result.failure === 'status') {
    return typeof result.status === 'number'
      ? `The endpoint answered with HTTP status ${result.status}.`
      : 'The endpoint answered with an error status.';
  }
  const known = FAILURES[result.failure];
  if (known) return known;
  return FAILURE_CODE.test(result.failure)
    ? `The test failed with ${result.failure}.`
    : 'The test failed for a reason this CLI version does not know.';
}

export default async function test(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewayInferenceHooksTestTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const parsed = parseLeaf(
    client,
    argv,
    inferenceHooksTestSubcommand.options,
    PATH,
    telemetry
  );
  if (typeof parsed === 'number') return parsed;
  const { flags, json } = parsed;

  const issues: Array<{ field: string; message: string }> = [];
  const endpointUrlFlag = readEndpointUrl(
    flags['--endpoint-url'] as string | undefined,
    issues
  );
  const timeoutMs = readInteger(
    flags['--timeout-ms'] as number | undefined,
    'timeout-ms',
    1,
    10_000,
    issues
  );
  const headers = readHeaders(
    flags['--header'] as string[] | undefined,
    issues
  );
  if (issues.length) {
    return usageError(client, json, PATH, {
      message: `Can't run the connection test. ${issues.length} ${
        issues.length === 1 ? 'option is' : 'options are'
      } invalid.`,
      issues,
    });
  }

  const team = await requireTeam(client, json, PATH);
  if (team !== true) return team;

  const warnings: Warning[] = [];
  let endpointUrl = endpointUrlFlag;
  if (endpointUrl === undefined) {
    progress(client, json, 'Fetching inference hooks…');
    let config: InferenceHooksConfig;
    try {
      config = await getInferenceHooksConfig(client);
    } catch (err) {
      return handleApiError(client, json, err, {
        action: 'read the saved endpoint URL',
      });
    }
    output.stopSpinner();
    if (!config.configured) {
      return fail(client, json, {
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          "Can't run the connection test without --endpoint-url. No endpoint URL is saved.",
        next: [
          {
            command: 'test --endpoint-url <URL>',
            when: 'Pass the endpoint to test',
            placeholders: ['<URL>'],
          },
        ],
      });
    }
    endpointUrl = config.endpointUrl;
    const stored = config.headers?.names ?? [];
    if (stored.length && !headers?.length) {
      warnings.push({
        reason: AGENT_REASON.STORED_HEADERS_NOT_SENT,
        message: `A test doesn't send stored headers. Pass the ones the endpoint needs with --header: ${stored
          .map(remoteText)
          .join(', ')}.`,
      });
    }
  }

  progress(client, json, 'Testing the endpoint…');
  let result: ConnectionTestResult;
  try {
    result = await testInferenceHookConnection(client, {
      endpointUrl,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(headers?.length ? { headers } : {}),
    });
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'run the connection test',
      carriesSecret: Boolean(headers?.length),
      rateLimitDetail: 'Connection tests are rate limited per team.',
      serverCause: (status, code) =>
        code === 'inference_hook_test_unavailable'
          ? "AI Gateway couldn't run it."
          : code === 'rate_limit_unavailable'
            ? "The connection test's rate limiter is unavailable."
            : status === 502
              ? "AI Gateway couldn't run it."
              : status === 503
                ? 'The connection test is unavailable.'
                : undefined,
    });
  }
  output.stopSpinner();

  const exitCode = result.ok ? 0 : 1;
  if (json) {
    printJson(client, {
      connectionTest: result,
      ...(warnings.length ? { warnings } : {}),
    });
    return exitCode;
  }

  const urlRow = formatAlignedLabel('Endpoint URL', remoteText(endpointUrl));
  if (result.ok) {
    const action = remoteText(String(result.action));
    const rows = [
      formatAlignedLabel('Tested', 'inference hooks endpoint', {
        gutter: '✓',
      }),
      urlRow,
      formatAlignedLabel('Verdict', action),
      formatAlignedLabel('Latency', `${result.latencyMs} ms`),
      ...(result.denyReason
        ? [
            formatAlignedLabel(
              'Deny Reason',
              `Endpoint: ${remoteText(result.denyReason)}`
            ),
          ]
        : []),
      ...(result.referenceId
        ? [formatAlignedLabel('Reference ID', remoteText(result.referenceId))]
        : []),
    ];
    client.stdout.write(`${rows.join('\n')}\n`);
    printWarnings(warnings);
    return exitCode;
  }

  printWarnings(warnings);
  output.fatal(`The connection test failed. ${describeFailure(result)}`);
  output.print(`${urlRow}\n`);
  output.print(
    `${formatAlignedLabel('Failure', remoteText(String(result.failure)))}\n`
  );
  if (typeof result.latencyMs === 'number') {
    output.print(
      `${formatAlignedLabel('Latency', `${result.latencyMs} ms`)}\n`
    );
  }
  if (result.detail) {
    output.print(
      `${formatAlignedLabel('Detail', `AI Gateway: ${remoteText(result.detail)}`)}\n`
    );
  }
  const next: NextStep[] =
    result.failure === 'secret_missing'
      ? [{ command: 'signing-secret create', when: 'Create one' }]
      : [];
  printSteps(client, next);
  return exitCode;
}
