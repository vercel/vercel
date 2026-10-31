import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import output from '../../output-manager';
import { analyzeSubcommand } from './command';
import { getExperimentAnalysis } from './api';
import {
  assessExperimentAnalysis,
  buildExperimentNextCommands,
  printExperimentAnalysis,
  printNextCommands,
} from './output';
import {
  fetchExperimentContext,
  isJson,
  jsonResult,
  parseSubcommand,
  printExperimentError,
  unitKeyFromBase,
  writeJson,
} from './utils';

export default async function runAnalyze(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, analyzeSubcommand);
  if (!parsed) return 2;
  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments analyze <experiment>'
  );
  if (typeof context === 'number') return context;
  const experiment = context.experiment;
  const metrics = experiment.metrics ?? {};
  if (Object.keys(metrics).length === 0) {
    output.error('This experiment has no metrics to analyze.');
    return 1;
  }
  const primaryMetric =
    typeof parsed.flags['--metric'] === 'string'
      ? parsed.flags['--metric']
      : experiment.primaryMetric;
  if (primaryMetric && !(primaryMetric in metrics)) {
    output.error(
      `Metric ${primaryMetric} isn't configured. Choose one of: ${Object.keys(metrics).join(', ')}.`
    );
    return 1;
  }
  const epoch = experiment.rampId
    ? experiment.epochs.find(item => item.rampId === experiment.rampId)
    : experiment.epochs.at(-1);
  if (!epoch) {
    output.error(
      'This experiment has no analysis epoch. Start it before requesting results.'
    );
    return 1;
  }

  const body: JSONObject = {
    metrics: metrics as unknown as JSONObject,
    ...(primaryMetric ? { primaryMetric } : {}),
    controlVariantId: experiment.controlVariantId,
    expectedVariantWeights: experiment.weights,
    excludeContaminated: parsed.flags['--exclude-contaminated'] === true,
    unitKey: unitKeyFromBase(experiment),
    rampId: epoch.rampId,
    from: new Date(epoch.startedAt).toISOString(),
    ...(epoch.endedAt ? { to: new Date(epoch.endedAt).toISOString() } : {}),
  };

  try {
    output.spinner('Analyzing experiment…');
    const analysis = await getExperimentAnalysis(
      client,
      context.link.project.id,
      experiment.id,
      body
    );
    output.stopSpinner();
    const next = buildExperimentNextCommands(client, experiment);
    const assessment = assessExperimentAnalysis(experiment, analysis);
    if (isJson(parsed.flags)) {
      writeJson(
        client,
        jsonResult(experiment, next, {
          analysis: analysis as unknown as JSONObject,
          assessment: assessment as unknown as JSONObject,
        })
      );
    } else {
      printExperimentAnalysis(experiment, analysis, assessment);
      printNextCommands(next);
    }
    return 0;
  } catch (error) {
    output.stopSpinner();
    printExperimentError(client, error, isJson(parsed.flags));
    return 1;
  }
}
