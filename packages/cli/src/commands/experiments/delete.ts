import type Client from '../../util/client';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { deleteSubcommand } from './command';
import { deleteExperiment } from './api';
import {
  buildDeletedNextCommands,
  getExperimentIdentifier,
  printNextCommands,
} from './output';
import {
  fetchExperimentContext,
  isJson,
  outputCanceled,
  parseSubcommand,
  printExperimentError,
  printMutationPreview,
  writeJson,
} from './utils';

export default async function runDelete(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, deleteSubcommand);
  if (!parsed) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments delete <experiment> --confirm <experiment>'
  );
  if (typeof context === 'number') return context;
  const experiment = context.experiment;
  const experimentIdentifier = getExperimentIdentifier(experiment);
  const proof = parsed.flags['--confirm'];
  const proofMatches =
    proof === experiment.id ||
    proof === experiment.slug ||
    proof === parsed.args[0];

  if (!isJson(parsed.flags)) {
    printMutationPreview(
      context.link,
      experiment,
      `${experiment.state} → deleted`,
      `Delete experiment data and release feature flag ${experiment.flagSlug}`
    );
  }

  if (!proofMatches) {
    if (isJson(parsed.flags) || client.nonInteractive || !client.stdin.isTTY) {
      const command = buildCommandWithGlobalFlags(
        client.argv,
        `experiments delete ${experimentIdentifier} --confirm ${experimentIdentifier}`,
        undefined,
        { preserveProject: true }
      );
      if (isJson(parsed.flags) || client.nonInteractive) {
        writeJson(client, {
          status: 'action_required',
          reason: 'confirmation_required',
          message:
            'Deleting an experiment permanently removes its history and releases its feature flag.',
          userActionRequired: true,
          next: [{ command }],
        });
      } else {
        output.error(
          `Provide --confirm ${experimentIdentifier} to delete this experiment non-interactively.`
        );
      }
      return 1;
    }
    const typed = await client.input.text({
      message: `Type ${experimentIdentifier} to confirm deletion:`,
    });
    if (typed !== experimentIdentifier) return outputCanceled();
  }

  try {
    output.spinner('Deleting experiment…');
    await deleteExperiment(client, context.link.project.id, experiment.id);
    output.stopSpinner();
    const next = buildDeletedNextCommands(client, experiment);
    if (isJson(parsed.flags)) {
      writeJson(client, {
        status: 'success',
        deletedExperiment: {
          id: experiment.id,
          slug: experiment.slug,
          name: experiment.name,
        },
        releasedFlag: {
          id: experiment.flagId,
          slug: experiment.flagSlug,
        },
        next,
      });
    } else {
      printAlignedLabel('Deleted', experiment.name, { gutter: '✓' });
      printAlignedLabel('Released Flag', experiment.flagSlug);
      printNextCommands(next);
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error, isJson(parsed.flags));
    return 1;
  }
}
