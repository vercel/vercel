import type Client from '../../util/client';
import output from '../../output-manager';
import { canPrompt } from '../../util/can-prompt';
import { type Drain, getDrain, updateDrain } from '../../util/drains/api';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { remoteText } from '../../util/output/remote-text';
import { pauseSubcommand, resumeSubcommand } from './command';
import { printReceipt } from './format';
import { confirmOrFail } from './confirm';
import {
  handleApiError,
  inspectNext,
  parseSubcommand,
  printJson,
  printStdoutIdentifier,
  progress,
  readDrainId,
  redactDrain,
} from './shared';

export function pause(client: Client, argv: string[]): Promise<number> {
  return setStatus(client, argv, 'pause');
}

export function resume(client: Client, argv: string[]): Promise<number> {
  return setStatus(client, argv, 'resume');
}

async function setStatus(
  client: Client,
  argv: string[],
  verb: 'pause' | 'resume'
): Promise<number> {
  const command = verb === 'pause' ? pauseSubcommand : resumeSubcommand;
  const path = `drains ${verb}`;
  const parsed = parseSubcommand(client, argv, command.options, path);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, json } = parsed;

  const id = readDrainId(client, json, args, path, verb);
  if (typeof id === 'number') return id;

  progress(client, json, 'Fetching drain…');
  let current: Drain;
  try {
    current = await getDrain(client, id);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `${verb} drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  const paused = current.status === 'disabled';
  const unchanged = verb === 'pause' ? paused : current.status === 'enabled';
  if (unchanged) {
    if (json) {
      return printJson(client, {
        drain: redactDrain(current),
        outcome: 'unchanged',
      });
    }
    output.print(
      `  Drain ${remoteText(current.name)} is already ${verb === 'pause' ? 'paused' : 'running'}.\n`
    );
    printStdoutIdentifier(client, current.id);
    return 0;
  }

  if (verb === 'pause') {
    const yes = Boolean((flags as { '--yes'?: boolean })['--yes']);
    const consent = await confirmOrFail(client, json, {
      yes,
      interactive: !json && canPrompt(client),
      preview: [
        formatAlignedLabel('Drain', remoteText(current.name)),
        formatAlignedLabel('Drain ID', current.id),
        '',
        "  Data generated while it's paused won't be sent and can't be recovered.",
      ],
      question: `Pause drain ${remoteText(current.name)}?`,
      action: `pause drain ${current.id}`,
      consequence: "data generated while it's paused won't be sent",
      effects: [`Pause drain ${current.id}`],
    });
    if (consent !== true) return consent;
  }

  progress(
    client,
    json,
    verb === 'pause' ? 'Pausing drain…' : 'Resuming drain…'
  );
  let drain;
  try {
    drain = await updateDrain(client, id, {
      status: verb === 'pause' ? 'disabled' : 'enabled',
    });
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `${verb} drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  const outcome = verb === 'pause' ? 'paused' : 'resumed';
  if (json) {
    return printJson(client, {
      drain: redactDrain(drain),
      outcome,
      next: inspectNext(client, drain.id),
    });
  }
  printReceipt(verb === 'pause' ? 'Paused' : 'Resumed', drain, {
    details: false,
  });
  printStdoutIdentifier(client, drain.id);
  return 0;
}
