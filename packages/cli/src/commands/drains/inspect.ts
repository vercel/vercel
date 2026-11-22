import type Client from '../../util/client';
import output from '../../output-manager';
import { getDrain } from '../../util/drains/api';
import { inspectSubcommand } from './command';
import { formatDrainDetails } from './format';
import {
  handleApiError,
  parseSubcommand,
  printJson,
  progress,
  readDrainId,
  redactDrain,
} from './shared';

const PATH = 'drains inspect';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(client, argv, inspectSubcommand.options, PATH);
  if (typeof parsed === 'number') return parsed;
  const { args, json } = parsed;

  const id = readDrainId(client, json, args, PATH, 'inspect');
  if (typeof id === 'number') return id;

  progress(client, json, 'Fetching drain…');
  let drain;
  try {
    drain = await getDrain(client, id);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `inspect drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, { drain: redactDrain(drain) });
  }
  client.stdout.write(`${formatDrainDetails(drain)}\n`);
  return 0;
}
