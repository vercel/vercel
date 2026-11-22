import type Client from '../../util/client';
import { restartAnalysisSubcommand } from './command';
import { updateExperiment } from './api';
import {
  confirmAndMutateExperiment,
  fetchExperimentContext,
  parseSubcommand,
  requireExperimentState,
} from './utils';

export default async function runRestartAnalysis(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, restartAnalysisSubcommand);
  if (!parsed) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments restart-analysis <experiment>'
  );
  if (typeof context === 'number') return context;
  if (
    !requireExperimentState(
      context.experiment,
      'running',
      'restart its analysis'
    )
  ) {
    return 1;
  }
  return confirmAndMutateExperiment({
    client,
    flags: parsed.flags,
    context,
    transition: 'running → running',
    effect: 'Start a new analysis epoch without changing enrollment',
    prompt: 'Restart analysis for this experiment?',
    spinner: 'Restarting analysis…',
    mutation: () =>
      updateExperiment(client, context.link.project.id, context.experiment.id, {
        restartAnalysis: true,
      }),
    resultLabel: 'Restarted',
  });
}
