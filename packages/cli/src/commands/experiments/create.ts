import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { createSubcommand } from './command';
import { createExperiment } from './api';
import { buildExperimentNextCommands, printNextCommands } from './output';
import {
  isJson,
  jsonResult,
  parseSubcommand,
  printExperimentError,
  readJsonObject,
  resolveProject,
  writeJson,
} from './utils';

export default async function runCreate(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, createSubcommand);
  if (!parsed) return 2;
  if (parsed.args.length > 0) {
    output.error(
      `Too many arguments. Usage: ${getCommandName('experiments create --file <file>')}`
    );
    return 2;
  }
  const body = await readJsonObject(client, parsed.flags['--file']);
  if (!body) return 1;
  const link = await resolveProject(client, parsed.flags);
  if (typeof link === 'number') return link;
  try {
    output.spinner('Creating experiment…');
    const experiment = await createExperiment(client, link.project.id, body);
    output.stopSpinner();
    const next = buildExperimentNextCommands(client, experiment);
    if (isJson(parsed.flags)) {
      writeJson(client, jsonResult(experiment, next));
    } else {
      printAlignedLabel('Created', experiment.name, { gutter: '✓' });
      printAlignedLabel('Experiment', experiment.id);
      if (experiment.slug) {
        printAlignedLabel('Slug', experiment.slug);
      }
      printAlignedLabel('Feature Flag', experiment.flagSlug);
      printAlignedLabel('State', experiment.state);
      printNextCommands(next);
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error, isJson(parsed.flags));
    return 1;
  }
}
