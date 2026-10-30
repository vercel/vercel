import type Client from '../../util/client';
import { inspectSubcommand } from './command';
import {
  buildExperimentNextCommands,
  printExperimentDetails,
  printNextCommands,
} from './output';
import {
  fetchExperimentContext,
  isJson,
  jsonResult,
  parseSubcommand,
  writeJson,
} from './utils';

export default async function runInspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, inspectSubcommand);
  if (!parsed) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments inspect <experiment>'
  );
  if (typeof context === 'number') return context;
  const next = buildExperimentNextCommands(client, context.experiment);
  if (isJson(parsed.flags)) {
    writeJson(client, jsonResult(context.experiment, next));
  } else {
    printExperimentDetails(context.experiment);
    printNextCommands(next);
  }
  return 0;
}
