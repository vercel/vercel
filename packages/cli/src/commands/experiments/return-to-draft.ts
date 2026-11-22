import type Client from '../../util/client';
import output from '../../output-manager';
import type { ExperimentAction } from './types';
import { returnToDraftSubcommand } from './command';
import { applyExperimentAction } from './api';
import { buildExperimentNextCommands, printNextCommands } from './output';
import {
  confirmAndMutateExperiment,
  fetchExperimentContext,
  isJson,
  jsonResult,
  parseSubcommand,
  writeJson,
} from './utils';

export default async function runReturnToDraft(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, returnToDraftSubcommand);
  if (!parsed) return 2;
  const cause = parsed.flags['--cause'];
  if (
    cause !== undefined &&
    cause !== 'manual' &&
    cause !== 'guardrail' &&
    cause !== 'srm'
  ) {
    output.error('The --cause option must be manual, guardrail, or srm.');
    return 1;
  }
  const reason = parsed.flags['--reason'];
  if (typeof reason === 'string' && reason.trim().length === 0) {
    output.error('The --reason option cannot be empty.');
    return 1;
  }
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments return-to-draft <experiment>'
  );
  if (typeof context === 'number') return context;
  if (context.experiment.state === 'draft') {
    const next = buildExperimentNextCommands(client, context.experiment);
    if (isJson(parsed.flags)) {
      writeJson(
        client,
        jsonResult(context.experiment, next, { changed: false })
      );
    } else {
      output.log('Experiment is already in draft.');
      printNextCommands(next);
    }
    return 0;
  }
  const action: ExperimentAction = {
    action: 'return-to-draft',
    ...(cause ? { cause } : {}),
    ...(typeof reason === 'string' ? { reason } : {}),
  };
  return confirmAndMutateExperiment({
    client,
    flags: parsed.flags,
    context,
    transition: `${context.experiment.state} → draft`,
    effect: 'Serve control and stop the active measurement window',
    prompt: 'Return this experiment to draft?',
    spinner: 'Returning experiment to draft…',
    mutation: () =>
      applyExperimentAction(
        client,
        context.link.project.id,
        context.experiment.id,
        action
      ),
    resultLabel: 'Returned',
  });
}
