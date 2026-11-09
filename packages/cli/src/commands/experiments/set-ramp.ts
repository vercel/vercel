import type Client from '../../util/client';
import output from '../../output-manager';
import { setRampSubcommand } from './command';
import { applyExperimentAction } from './api';
import {
  confirmAndMutateExperiment,
  fetchExperimentContext,
  parseRamp,
  parseSubcommand,
  requireExperimentState,
} from './utils';

export default async function runSetRamp(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, setRampSubcommand);
  if (!parsed) return 2;
  const ramp = parseRamp(parsed.flags);
  if (ramp === undefined) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments set-ramp <experiment> --ramp <percentage>'
  );
  if (typeof context === 'number') return context;
  if (
    !requireExperimentState(context.experiment, 'running', 'change its ramp')
  ) {
    return 1;
  }
  const current = context.experiment.rampPercentage;
  if (ramp > context.experiment.targetPercentage) {
    output.error(
      `Ramp cannot exceed the configured target of ${context.experiment.targetPercentage}%.`
    );
    return 1;
  }
  if (ramp === current) {
    output.error(`The experiment ramp is already ${ramp}%.`);
    return 1;
  }
  const decreasing = current !== undefined && ramp < current;
  return confirmAndMutateExperiment({
    client,
    flags: parsed.flags,
    context,
    transition: 'running → running',
    effect: `${current ?? '—'}% → ${ramp}%${
      decreasing ? '; start a new analysis epoch' : '; keep the analysis epoch'
    }`,
    prompt: 'Change this experiment ramp?',
    spinner: 'Changing experiment ramp…',
    mutation: () =>
      applyExperimentAction(
        client,
        context.link.project.id,
        context.experiment.id,
        {
          action: 'set-ramp',
          rampPercentage: ramp,
        }
      ),
    resultLabel: 'Changed Ramp',
  });
}
