import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  getSigningSecretMetadata,
  type SigningSecretMetadata,
} from '../../util/ai-gateway/inference-hooks';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { AiGatewayInferenceHooksSigningSecretRotateTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { inferenceHooksSigningSecretRotateSubcommand } from './command';
import {
  confirmOrFail,
  fail,
  formatTime,
  GROUP,
  handleApiError,
  parseLeaf,
  progress,
  requireTeam,
} from './inference-hooks-shared';
import {
  deliverSigningSecret,
  requestSigningSecret,
} from './inference-hooks-signing-secret-create';

const PATH = `${GROUP} signing-secret rotate`;

export default async function rotate(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry =
    new AiGatewayInferenceHooksSigningSecretRotateTelemetryClient({
      opts: { store: client.telemetryEventStore },
    });
  const parsed = parseLeaf(
    client,
    argv,
    inferenceHooksSigningSecretRotateSubcommand.options,
    PATH,
    telemetry
  );
  if (typeof parsed === 'number') return parsed;
  const { flags, json } = parsed;

  const team = await requireTeam(client, json, PATH);
  if (team !== true) return team;

  progress(client, json, 'Fetching signing secret…');
  let current: SigningSecretMetadata;
  try {
    current = await getSigningSecretMetadata(client);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'read the signing secret',
    });
  }
  output.stopSpinner();

  if (!current.exists) {
    return fail(client, json, {
      reason: AGENT_REASON.NOT_FOUND,
      message: "Can't rotate the signing secret. This team doesn't have one.",
      next: [{ command: 'signing-secret create', when: 'Create one' }],
    });
  }

  const consent = await confirmOrFail(client, json, {
    yes: Boolean(flags['--yes']),
    preview: [
      formatAlignedLabel('Secret ID', current.secretId),
      formatAlignedLabel('Created', formatTime(current.createdAt)),
      ...(current.rotatedAt
        ? [formatAlignedLabel('Rotated', formatTime(current.rotatedAt))]
        : []),
      '',
      '  Issues a new signing secret. The current one stops working at once:',
      '  requests are signed with the new secret, so your server must switch to it.',
      '  This cannot be undone.',
    ],
    question: 'Rotate the signing secret?',
    action: 'rotate the signing secret',
    consequence:
      'the current signing secret stops working at once, and the server must switch to the new one',
    effects: [`Rotate signing secret ${current.secretId}`],
  });
  if (consent !== true) return consent;

  progress(client, json, 'Rotating signing secret…');
  const issued = await requestSigningSecret(client, json, current.secretId);
  if (typeof issued === 'number') return issued;
  return deliverSigningSecret(client, json, issued);
}
