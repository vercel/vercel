import type Client from '../../util/client';
import output from '../../output-manager';
import { updateSubcommand } from './command';
import { updateExperiment } from './api';
import {
  confirmMutation,
  fetchExperimentContext,
  mutateExperiment,
  parseSubcommand,
  readJsonObject,
} from './utils';

export default async function runUpdate(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, updateSubcommand);
  if (!parsed) return 2;
  const body = await readJsonObject(client, parsed.flags['--file']);
  if (!body) return 1;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments update <experiment> --file <file>'
  );
  if (typeof context === 'number') return context;
  const restart = parsed.flags['--restart-analysis'] === true;
  const keep = parsed.flags['--keep-analysis'] === true;
  if (restart && keep) {
    output.error('Use either --restart-analysis or --keep-analysis, not both.');
    return 2;
  }
  if ('restartAnalysis' in body && (restart || keep)) {
    output.error(
      'Set restartAnalysis in the JSON file or use a command option, not both.'
    );
    return 1;
  }
  if (context.experiment.state === 'running') {
    if (!('restartAnalysis' in body) && !restart && !keep) {
      output.error(
        'Updating a running experiment requires --restart-analysis or --keep-analysis.'
      );
      return 2;
    }
    if (!('restartAnalysis' in body)) body.restartAnalysis = restart;
  } else if ('restartAnalysis' in body || restart || keep) {
    output.error(
      'Analysis restart options only apply to a running experiment.'
    );
    return 1;
  }

  if (context.experiment.state !== 'draft') {
    const confirmation = await confirmMutation({
      client,
      flags: parsed.flags,
      link: context.link,
      experiment: context.experiment,
      transition: `${context.experiment.state} → ${context.experiment.state}`,
      effect:
        body.restartAnalysis === true
          ? 'Update serving settings and start a new analysis epoch'
          : context.experiment.state === 'running'
            ? 'Update serving settings and keep the current analysis epoch'
            : 'Update the completed experiment configuration',
      prompt: 'Update this experiment?',
    });
    if (confirmation !== undefined) return confirmation;
  }

  return mutateExperiment(
    client,
    parsed.flags,
    context,
    'Updating experiment…',
    () =>
      updateExperiment(
        client,
        context.link.project.id,
        context.experiment.id,
        body
      ),
    'Updated'
  );
}
