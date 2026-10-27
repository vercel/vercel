import type Client from '../../util/client';
import output from '../../output-manager';
import { decideSubcommand } from './command';
import { applyExperimentAction } from './api';
import {
  confirmAndMutateExperiment,
  fetchExperimentContext,
  parseSubcommand,
  requireExperimentState,
} from './utils';

export default async function runDecide(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, decideSubcommand);
  if (!parsed) return 2;
  const winner = parsed.flags['--winner'];
  const abandon = parsed.flags['--abandon'] === true;
  const rationale = parsed.flags['--rationale'];
  if ((typeof winner === 'string') === abandon) {
    output.error('Use exactly one of --winner <variant-id> or --abandon.');
    return 2;
  }
  if (typeof rationale !== 'string' || rationale.trim().length === 0) {
    output.error('Missing required option --rationale <text>.');
    return 2;
  }
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments decide <experiment> (--winner <variant-id>|--abandon) --rationale <text>'
  );
  if (typeof context === 'number') return context;
  if (
    !requireExperimentState(context.experiment, 'running', 'make a decision')
  ) {
    return 1;
  }
  if (
    typeof winner === 'string' &&
    !context.experiment.variants.some(variant => variant.id === winner)
  ) {
    output.error(
      `Variant ${winner} isn't part of this experiment. Choose one of: ${context.experiment.variants
        .map(variant => variant.id)
        .join(', ')}.`
    );
    return 1;
  }
  const effect = abandon
    ? 'Stop the experiment and serve control'
    : `Stop the experiment and serve variant ${winner as string}`;
  return confirmAndMutateExperiment({
    client,
    flags: parsed.flags,
    context,
    transition: `${context.experiment.state} → completed`,
    effect,
    prompt: 'Record this experiment decision?',
    spinner: 'Recording experiment decision…',
    mutation: () =>
      applyExperimentAction(
        client,
        context.link.project.id,
        context.experiment.id,
        {
          action: 'complete',
          outcome: abandon ? 'abandon' : 'winner',
          ...(typeof winner === 'string' ? { winnerVariantId: winner } : {}),
          rationale,
        }
      ),
    resultLabel: abandon ? 'Abandoned' : 'Completed',
  });
}
