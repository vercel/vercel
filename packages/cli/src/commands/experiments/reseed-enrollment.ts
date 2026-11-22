import type Client from '../../util/client';
import output from '../../output-manager';
import { reseedEnrollmentSubcommand } from './command';
import { applyExperimentAction } from './api';
import {
  confirmAndMutateExperiment,
  fetchExperimentContext,
  parseSubcommand,
} from './utils';

export default async function runReseedEnrollment(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, reseedEnrollmentSubcommand);
  if (!parsed) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments reseed-enrollment <experiment>'
  );
  if (typeof context === 'number') return context;
  if (context.experiment.state === 'completed') {
    output.error(
      'Cannot reseed a completed experiment. Return it to draft first.'
    );
    return 1;
  }
  const running = context.experiment.state === 'running';
  return confirmAndMutateExperiment({
    client,
    flags: parsed.flags,
    context,
    transition: `${context.experiment.state} → ${context.experiment.state}`,
    effect: running
      ? 'Reassign enrollment and start a new analysis epoch'
      : 'Reassign enrollment for the next run',
    prompt: 'Reseed enrollment for this experiment?',
    spinner: 'Reseeding enrollment…',
    mutation: () =>
      applyExperimentAction(
        client,
        context.link.project.id,
        context.experiment.id,
        {
          action: 'reseed-enrollment',
        }
      ),
    resultLabel: 'Reseeded',
  });
}
