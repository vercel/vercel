import type Client from '../../util/client';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { listExperiments } from './api';
import {
  buildListNextCommands,
  printExperimentsTable,
  printNextCommands,
} from './output';
import {
  isJson,
  parseSubcommand,
  printExperimentError,
  resolveProject,
  writeJson,
} from './utils';

export default async function runList(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, listSubcommand);
  if (!parsed) return 2;
  const state = parsed.flags['--state'];
  if (
    state !== undefined &&
    state !== 'draft' &&
    state !== 'running' &&
    state !== 'completed'
  ) {
    output.error('The --state option must be draft, running, or completed.');
    return 1;
  }
  const link = await resolveProject(client, parsed.flags);
  if (typeof link === 'number') return link;

  try {
    output.spinner('Fetching experiments…');
    const all = await listExperiments(client, link.project.id);
    output.stopSpinner();
    const experiments = state
      ? all.filter(experiment => experiment.state === state)
      : all;
    const next = buildListNextCommands(client);
    if (isJson(parsed.flags)) {
      writeJson(client, { status: 'success', experiments, next });
      return 0;
    }
    if (experiments.length === 0) {
      output.log(
        state ? `No experiments match state ${state}.` : 'No experiments found.'
      );
    } else {
      printExperimentsTable(experiments);
    }
    printNextCommands(next);
    return 0;
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error, isJson(parsed.flags));
    return 1;
  }
}
