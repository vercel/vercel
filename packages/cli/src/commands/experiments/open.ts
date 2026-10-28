import open from 'open';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import type { Experiment } from './types';
import { openSubcommand } from './command';
import { getExperiment, listExperiments } from './api';
import {
  buildExperimentNextCommands,
  buildListNextCommands,
  getExperimentIdentifier,
  printNextCommands,
} from './output';
import { parseSubcommand, printExperimentError, resolveProject } from './utils';

export default async function runOpen(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, openSubcommand);
  if (!parsed) return 2;
  const [id, extra] = parsed.args;
  if (extra) {
    output.error(
      `Too many arguments. Usage: ${getCommandName('experiments open [experiment]')}`
    );
    return 2;
  }
  const tab = parsed.flags['--tab'] ?? 'configuration';
  if (tab !== 'configuration' && tab !== 'analysis') {
    output.error('The --tab option must be configuration or analysis.');
    return 1;
  }
  if (!id && parsed.flags['--tab'] !== undefined) {
    output.error('The --tab option requires an experiment argument.');
    return 1;
  }
  const link = await resolveProject(client, parsed.flags);
  if (typeof link === 'number') return link;
  let experiment: Experiment | undefined;
  try {
    if (id) {
      output.spinner('Fetching experiment…');
      experiment = await getExperiment(client, link.project.id, id);
      output.stopSpinner();
    } else {
      output.spinner('Checking experiment access…');
      await listExperiments(client, link.project.id);
      output.stopSpinner();
    }
    const base = `https://vercel.com/${encodeURIComponent(link.org.slug)}/${encodeURIComponent(link.project.name)}/flags`;
    const url = experiment
      ? `${base}/experiment/${encodeURIComponent(experiment.id)}/${tab}`
      : base;
    if (client.stdout.isTTY) {
      output.log(
        `Opening ${experiment ? `experiment ${getExperimentIdentifier(experiment)}` : 'experiments'} in your browser…`
      );
      output.log(`Visit this URL if the browser doesn't open: ${url}`);
      void open(url).catch(() => undefined);
      printNextCommands(
        experiment
          ? buildExperimentNextCommands(client, experiment)
          : buildListNextCommands(client)
      );
    } else {
      client.stdout.write(`${url}\n`);
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error);
    return 1;
  }
}
