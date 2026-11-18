import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  issueSigningSecret,
  type IssuedSigningSecret,
} from '../../util/ai-gateway/inference-hooks';
import { isAPIError } from '../../util/errors-ts';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { AiGatewayInferenceHooksSigningSecretCreateTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { inferenceHooksSigningSecretCreateSubcommand } from './command';
import {
  fail,
  formatTime,
  groupCommand,
  GROUP,
  handleApiError,
  maskSecretInCi,
  parseLeaf,
  printJson,
  progress,
  requireTeam,
} from './inference-hooks-shared';

const PATH = `${GROUP} signing-secret create`;

function isIssuedSigningSecret(value: unknown): value is IssuedSigningSecret {
  const issued = value as Partial<IssuedSigningSecret> | null;
  return (
    typeof issued?.signingSecret === 'string' &&
    issued.signingSecret.length > 0 &&
    typeof issued.secretId === 'string'
  );
}

/**
 * Sends the create or rotate request. A response that isn't an API error can
 * still hold the secret (an unparseable body), so its text is never shown.
 */
export async function requestSigningSecret(
  client: Client,
  json: boolean,
  expectedSecretId: string | null
): Promise<IssuedSigningSecret | number> {
  const rotate = expectedSecretId !== null;
  const outcome = `the signing secret was ${rotate ? 'rotated' : 'created'}`;
  // If the request landed, its secret is lost: only a new rotation gets a
  // value to save.
  const unknownNext = [
    { command: 'status', when: 'Check whether a signing secret exists' },
    {
      command: 'signing-secret rotate',
      when: 'If one exists, rotate it to get a value you can save',
    },
  ];
  let issued: unknown;
  try {
    issued = await issueSigningSecret(client, expectedSecretId);
  } catch (err) {
    if (isAPIError(err) && err.status === 409) {
      return fail(
        client,
        json,
        rotate
          ? {
              reason: AGENT_REASON.CONFLICT,
              message:
                "Can't rotate the signing secret. It changed after it was read.",
              next: [
                { command: 'status', when: 'Check the current signing secret' },
              ],
            }
          : {
              reason: AGENT_REASON.CONFLICT,
              message:
                "Can't create a signing secret. This team already has one.",
              next: [
                {
                  command: 'signing-secret rotate',
                  when: 'Replace it with a new one',
                },
              ],
            }
      );
    }
    return handleApiError(client, json, err, {
      action: `${rotate ? 'rotate' : 'create'} the signing secret`,
      unknownOutcome: outcome,
      unknownNext,
      unknownOnUnreadableBody: true,
    });
  }
  // A 2xx that isn't the expected JSON comes back as a raw response or null.
  if (!isIssuedSigningSecret(issued)) {
    return fail(client, json, {
      reason: AGENT_REASON.UNKNOWN_OUTCOME,
      message: `Can't confirm whether ${outcome}. The response couldn't be read.`,
      next: unknownNext,
      retryable: false,
      data: { remote: 'unknown' },
    });
  }
  return { ...issued, rotated: rotate };
}

/**
 * Delivers a new secret: alone on stdout in human mode, with the receipt on
 * stderr, or inside the one JSON document with `--json`.
 */
export function deliverSigningSecret(
  client: Client,
  json: boolean,
  issued: IssuedSigningSecret
): number {
  const rotated = issued.rotated;
  output.stopSpinner();
  maskSecretInCi(client, issued.signingSecret);
  if (json) {
    return printJson(client, {
      signingSecret: {
        exists: true,
        secretId: issued.secretId,
        createdAt: issued.createdAt,
        rotatedAt: issued.rotatedAt,
        value: issued.signingSecret,
      },
      outcome: rotated ? 'rotated' : 'created',
      next: [
        {
          command: groupCommand(client, 'status'),
          when: 'Check the signing secret',
        },
      ],
    });
  }
  client.stdout.write(`${issued.signingSecret}\n`);
  output.print(
    `${formatAlignedLabel(rotated ? 'Rotated' : 'Created', 'signing secret', { gutter: '✓' })}\n`
  );
  output.print(`${formatAlignedLabel('Secret ID', issued.secretId)}\n`);
  output.print(
    `${formatAlignedLabel(
      rotated ? 'Rotated' : 'Created',
      formatTime(rotated ? issued.rotatedAt : issued.createdAt)
    )}\n`
  );
  output.print(
    "\n  The secret went to stdout and isn't shown again. Save it where your server can read it.\n"
  );
  return 0;
}

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry =
    new AiGatewayInferenceHooksSigningSecretCreateTelemetryClient({
      opts: { store: client.telemetryEventStore },
    });
  const parsed = parseLeaf(
    client,
    argv,
    inferenceHooksSigningSecretCreateSubcommand.options,
    PATH,
    telemetry
  );
  if (typeof parsed === 'number') return parsed;
  const { json } = parsed;

  const team = await requireTeam(client, json, PATH);
  if (team !== true) return team;

  progress(client, json, 'Creating signing secret…');
  const issued = await requestSigningSecret(client, json, null);
  if (typeof issued === 'number') return issued;
  return deliverSigningSecret(client, json, issued);
}
