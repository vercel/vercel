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
  progress,
  requireTeam,
  signingSecretRequired,
} from './inference-hooks-shared';

/**
 * `enable` and `disable`: read the config, then save it with `enabled`
 * changed. `enable` checks for a signing secret first.
 */
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
  try {
    current = await getInferenceHooksConfig(client);
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

  if (current.enabled === enabled) {
    if (json) {
      return printJson(client, {
        inferenceHooks: current,
        outcome: 'unchanged',
        next: [statusNext(client)],
      });
    }
    output.print(`  Inference hooks are already ${verb}d.\n`);
    return 0;
  }

  // The API refuses to turn hooks on without a signing secret; say so before
  // sending the write.
  if (enabled) {
    progress(client, json, 'Fetching signing secret…');
    let secret: SigningSecretMetadata;
    try {
      secret = await getSigningSecretMetadata(client);
    } catch (err) {
      return handleApiError(client, json, err, {
        action: 'read the signing secret',
      });
    }
    output.stopSpinner();
    if (!secret.exists) {
      return signingSecretRequired(client, json, 'enable inference hooks');
    }
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
      next: [statusNext(client)],
    });
  }

  output.print(
    `${formatAlignedLabel(enabled ? 'Enabled' : 'Disabled', 'inference hooks', { gutter: '✓' })}\n`
  );
  if (saved.configured) {
    output.print(`${formatConfigRows(saved).slice(1).join('\n')}\n`);
  }
  return 0;
}

function statusNext(client: Client) {
  return {
    command: groupCommand(client, 'status'),
    when: 'Check the configuration',
  };
}

export default function enable(client: Client, argv: string[]) {
  return setEnabled(client, argv, true);
}
