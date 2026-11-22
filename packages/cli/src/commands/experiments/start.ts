import type Client from '../../util/client';
import output from '../../output-manager';
import { startSubcommand } from './command';
import { applyExperimentAction } from './api';
import {
  confirmAndMutateExperiment,
  fetchExperimentContext,
  parseRamp,
  parseSubcommand,
  requireExperimentState,
} from './utils';

export default async function runStart(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, startSubcommand);
  if (!parsed) return 2;
  const ramp = parseRamp(parsed.flags);
  if (ramp === undefined) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments start <experiment> --ramp <percentage>'
  );
  if (typeof context === 'number') return context;
  if (!requireExperimentState(context.experiment, 'draft', 'start it'))
    return 1;
  if (ramp > context.experiment.targetPercentage) {
    output.error(
      `Ramp cannot exceed the configured target of ${context.experiment.targetPercentage}%.`
    );
    return 1;
  }
  return confirmAndMutateExperiment({
    client,
    flags: parsed.flags,
    context,
    transition: `${context.experiment.state} → running`,
    effect: `Enroll ${ramp}% of eligible units`,
    prompt: 'Start this experiment?',
    spinner: 'Starting experiment…',
    mutation: () =>
      applyExperimentAction(
        client,
        context.link.project.id,
        context.experiment.id,
        {
          action: 'start',
          rampPercentage: ramp,
        }
      ),
    resultLabel: 'Started',
  });
}
