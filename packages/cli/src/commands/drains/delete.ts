import type Client from '../../util/client';
import output from '../../output-manager';
import { canPrompt } from '../../util/can-prompt';
import { type Drain, deleteDrain, getDrain } from '../../util/drains/api';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { remoteText } from '../../util/output/remote-text';
import { deleteSubcommand } from './command';
import { confirmOrFail } from './confirm';
import { formatType, getEndpoint, printReceipt } from './format';
import {
  drainsCommand,
  handleApiError,
  parseSubcommand,
  printJson,
  printStdoutIdentifier,
  progress,
  readDrainId,
} from './shared';

const PATH = 'drains delete';

export default async function deleteCommand(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(client, argv, deleteSubcommand.options, PATH);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, json } = parsed;

  const id = readDrainId(client, json, args, PATH, 'delete');
  if (typeof id === 'number') return id;

  progress(client, json, 'Fetching drain…');
  let drain: Drain;
  try {
    drain = await getDrain(client, id);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `delete drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  const consent = await confirmOrFail(client, json, {
    yes: Boolean(flags['--yes']),
    interactive: !json && canPrompt(client),
    preview: [
      formatAlignedLabel('Drain', remoteText(drain.name)),
      formatAlignedLabel('Drain ID', drain.id),
      formatAlignedLabel('Type', formatType(drain)),
      formatAlignedLabel('URL', remoteText(getEndpoint(drain) ?? '-')),
      '',
      '  Stops sending data to this endpoint and deletes the drain.',
      '  This cannot be undone.',
    ],
    question: `Delete drain ${remoteText(drain.name)}?`,
    action: `delete drain ${drain.id}`,
    consequence: 'the drain stops sending data and is deleted permanently',
    effects: [`Delete drain ${drain.id}`],
  });
  if (consent !== true) return consent;

  progress(client, json, 'Deleting drain…');
  try {
    await deleteDrain(client, id);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `delete drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, {
      drain: { id: drain.id, name: drain.name },
      outcome: 'deleted',
      next: [
        {
          command: drainsCommand(client, 'list'),
          when: 'List the remaining drains',
        },
      ],
    });
  }
  printReceipt('Deleted', drain, { details: false });
  printStdoutIdentifier(client, drain.id);
  return 0;
}
