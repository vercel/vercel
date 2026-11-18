import type Client from '../../util/client';
import output from '../../output-manager';
import {
  getInferenceHooksConfig,
  getSigningSecretMetadata,
  type InferenceHooksConfig,
  type SigningSecretMetadata,
} from '../../util/ai-gateway/inference-hooks';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { AiGatewayInferenceHooksStatusTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { inferenceHooksStatusSubcommand } from './command';
import {
  formatConfigRows,
  formatTime,
  GROUP,
  handleApiError,
  type NextStep,
  parseLeaf,
  printJson,
  printSteps,
  progress,
  requireTeam,
} from './inference-hooks-shared';

const PATH = `${GROUP} status`;

export function formatSigningSecret(secret: SigningSecretMetadata): string {
  if (!secret.exists) return 'None';
  return secret.rotatedAt
    ? `Rotated ${formatTime(secret.rotatedAt)}`
    : `Created ${formatTime(secret.createdAt)}`;
}

export default async function status(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewayInferenceHooksStatusTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const parsed = parseLeaf(
    client,
    argv,
    inferenceHooksStatusSubcommand.options,
    PATH,
    telemetry
  );
  if (typeof parsed === 'number') return parsed;
  const { json } = parsed;

  const team = await requireTeam(client, json, PATH);
  if (team !== true) return team;

  progress(client, json, 'Fetching inference hooks…');
  let config: InferenceHooksConfig;
  let secret: SigningSecretMetadata;
  try {
    // One after the other: a read that is still retrying would keep the
    // command running after the other one already failed.
    config = await getInferenceHooksConfig(client);
    secret = await getSigningSecretMetadata(client);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'read the inference hooks configuration',
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, { inferenceHooks: config, signingSecret: secret });
  }

  const rows = config.configured
    ? formatConfigRows(config)
    : [formatAlignedLabel('Status', 'Not configured')];
  rows.push(formatAlignedLabel('Signing Secret', formatSigningSecret(secret)));
  client.stdout.write(`${rows.join('\n')}\n`);

  const next: NextStep[] = [];
  if (!config.configured) {
    next.push({
      command: 'set --endpoint-url <URL>',
      when: 'Set up inference hooks',
      placeholders: ['<URL>'],
    });
  }
  if (!secret.exists) {
    next.push({
      command: 'signing-secret create',
      when: 'Create the secret that signs each request',
    });
  }
  if (config.configured && !config.enabled) {
    next.push({ command: 'enable', when: 'Turn on inference hooks' });
  }
  printSteps(client, next);
  return 0;
}
