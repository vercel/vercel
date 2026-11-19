import type Client from '../../util/client';
import output from '../../output-manager';
import {
  deleteInferenceHooksConfig,
  getInferenceHooksConfig,
  type InferenceHooksConfig,
} from '../../util/ai-gateway/inference-hooks';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { AiGatewayInferenceHooksRemoveTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { inferenceHooksRemoveSubcommand } from './command';
import {
  confirmOrFail,
  formatConfigRows,
  groupCommand,
  GROUP,
  handleApiError,
  parseLeaf,
  printJson,
  progress,
  requireTeam,
} from './inference-hooks-shared';

const PATH = `${GROUP} remove`;

export default async function remove(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewayInferenceHooksRemoveTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const parsed = parseLeaf(
    client,
    argv,
    inferenceHooksRemoveSubcommand.options,
    PATH,
    telemetry
  );
  if (typeof parsed === 'number') return parsed;
  const { flags, json } = parsed;

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

  if (!current.configured) {
    if (json) {
      return printJson(client, {
        inferenceHooks: current,
        outcome: 'unchanged',
      });
    }
    output.print('  No inference hooks are set up for this team.\n');
    return 0;
  }

  const headerNames = current.headers?.names ?? [];
  const consent = await confirmOrFail(client, json, {
    yes: Boolean(flags['--yes']),
    preview: [
      ...formatConfigRows(current),
      '',
      '  Stops sending requests to this endpoint and deletes the stored headers.',
      '  The signing secret is kept.',
      ...(headerNames.length ? ['  Some effects cannot be undone.'] : []),
    ],
    question: 'Remove the inference hooks configuration?',
    action: 'remove the inference hooks configuration',
    consequence:
      'requests stop going to the endpoint, and the stored header values are deleted',
    effects: [
      'Remove the inference hooks configuration',
      ...(headerNames.length
        ? [
            `Delete ${headerNames.length} stored ${headerNames.length === 1 ? 'header' : 'headers'}`,
          ]
        : []),
    ],
  });
  if (consent !== true) return consent;

  progress(client, json, 'Removing inference hooks…');
  try {
    await deleteInferenceHooksConfig(client);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: 'remove the inference hooks configuration',
      unknownOutcome: 'the inference hooks configuration was removed',
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, {
      inferenceHooks: { configured: false },
      outcome: 'removed',
      next: [
        {
          command: groupCommand(client, 'status'),
          when: 'Check the configuration',
        },
      ],
    });
  }
  output.print(
    `${formatAlignedLabel('Removed', 'inference hooks', { gutter: '✓' })}\n`
  );
  output.print('  The signing secret was kept.\n');
  return 0;
}
