import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  getInferenceHooksConfig,
  getSigningSecretMetadata,
  putInferenceHooksConfig,
  type InferenceHooksConfig,
  type SigningSecretMetadata,
} from '../../util/ai-gateway/inference-hooks';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import {
  AiGatewayInferenceHooksDisableTelemetryClient,
  AiGatewayInferenceHooksEnableTelemetryClient,
} from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import {
  inferenceHooksDisableSubcommand,
  inferenceHooksEnableSubcommand,
} from './command';
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
  requireTeam,
  type Warning,
} from './inference-hooks-shared';

/** `enable` and `disable`: read the config, then save it with `enabled` changed. */
export async function setEnabled(
  client: Client,
  argv: string[],
  enabled: boolean
): Promise<number> {
  const verb = enabled ? 'enable' : 'disable';
  const path = `${GROUP} ${verb}`;
  const telemetryOpts = { opts: { store: client.telemetryEventStore } };
  const parsed = parseLeaf(
    client,
    argv,
    enabled
      ? inferenceHooksEnableSubcommand.options
      : inferenceHooksDisableSubcommand.options,
    path,
    enabled
      ? new AiGatewayInferenceHooksEnableTelemetryClient(telemetryOpts)
      : new AiGatewayInferenceHooksDisableTelemetryClient(telemetryOpts)
  );
  if (typeof parsed === 'number') return parsed;
  const { json } = parsed;

  const team = await requireTeam(client, json, path);
  if (team !== true) return team;

  progress(client, json, 'Fetching inference hooks…');
  let current: InferenceHooksConfig;
  let secret: SigningSecretMetadata | undefined;
  try {
    // One after the other, as in `status`: a failed read ends the command.
    current = await getInferenceHooksConfig(client);
    secret =
      enabled && current.configured
        ? await getSigningSecretMetadata(client)
        : undefined;
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'read the inference hooks configuration',
    });
  }
  output.stopSpinner();

  if (!current.configured) {
    return fail(client, json, {
      reason: AGENT_REASON.NOT_FOUND,
      message: `Can't ${verb} inference hooks. None are set up for this team.`,
      next: [
        {
          command: 'set --endpoint-url <URL>',
          when: 'Set them up first',
          placeholders: ['<URL>'],
        },
      ],
    });
  }

  const warnings: Warning[] = [];
  if (enabled && secret && !secret.exists) {
    warnings.push({
      reason: AGENT_REASON.SIGNING_SECRET_MISSING,
      message:
        current.mode === 'enforce' && current.failureMode === 'closed'
          ? "This team has no signing secret, so requests aren't sent to the endpoint. In enforce mode with failure mode closed, they fail until one exists."
          : "This team has no signing secret, so requests aren't sent to the endpoint until one exists.",
    });
  }

  const createSecret = {
    command: 'signing-secret create',
    when: 'Create the signing secret',
  };
  const jsonNext = [
    ...(warnings.length
      ? [
          {
            command: groupCommand(client, createSecret.command),
            when: createSecret.when,
          },
        ]
      : []),
    {
      command: groupCommand(client, 'status'),
      when: 'Check the configuration',
    },
  ];

  if (current.enabled === enabled) {
    if (json) {
      return printJson(client, {
        inferenceHooks: current,
        outcome: 'unchanged',
        ...(warnings.length ? { warnings } : {}),
        next: jsonNext,
      });
    }
    output.print(`  Inference hooks are already ${verb}d.\n`);
    printWarnings(warnings);
    printSteps(client, warnings.length ? [createSecret] : []);
    return 0;
  }

  progress(client, json, enabled ? 'Enabling…' : 'Disabling…');
  let saved: InferenceHooksConfig;
  try {
    // No `headers` key: the URL is unchanged, so the stored headers are kept.
    saved = await putInferenceHooksConfig(client, {
      endpointUrl: current.endpointUrl,
      enabled,
      mode: current.mode,
      failureMode: current.failureMode,
      timeoutMs: current.timeoutMs,
      rolloutPercent: current.rolloutPercent,
    });
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `${verb} inference hooks`,
      unknownOutcome: `inference hooks were ${verb}d`,
      savedInput: true,
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, {
      inferenceHooks: saved,
      outcome: `${verb}d`,
      ...(warnings.length ? { warnings } : {}),
      next: jsonNext,
    });
  }

  output.print(
    `${formatAlignedLabel(enabled ? 'Enabled' : 'Disabled', 'inference hooks', { gutter: '✓' })}\n`
  );
  if (saved.configured) {
    output.print(`${formatConfigRows(saved).slice(1).join('\n')}\n`);
  }
  printWarnings(warnings);
  printSteps(client, warnings.length ? [createSecret] : []);
  return 0;
}

export default function enable(client: Client, argv: string[]) {
  return setEnabled(client, argv, true);
}
