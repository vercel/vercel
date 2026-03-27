import type Client from '../client';
import { getFlag } from '../flags/get-flags';
import { updateFlag } from '../flags/update-flag';
import type { Flag, MetricDefinition } from '../flags/types';

/**
 * Appends a metric to an existing flag experiment via PATCH flag (embedded
 * `primaryMetrics` / `guardrailMetrics` — see api-feature-flags experiment schema).
 */
export async function appendMetricToExperiment(
  client: Client,
  projectId: string,
  flagSlug: string,
  metric: MetricDefinition,
  options: { guardrail?: boolean }
): Promise<{ flag: Flag; metric: MetricDefinition }> {
  const flag = await getFlag(client, projectId, flagSlug);
  if (!flag.experiment) {
    throw new Error(
      `Flag "${flagSlug}" has no experiment. Create one with \`experiment create\` first.`
    );
  }

  const exp = flag.experiment;

  if (options.guardrail) {
    const guardrailMetrics = [...(exp.guardrailMetrics ?? [])];
    if (guardrailMetrics.length >= 2) {
      throw new Error(
        'This experiment already has the maximum of 2 guardrail metrics.'
      );
    }
    guardrailMetrics.push(metric);
    const updated = await updateFlag(client, projectId, flagSlug, {
      experiment: {
        ...exp,
        guardrailMetrics,
      },
    });
    return { flag: updated, metric };
  }

  const primaryMetrics = [...(exp.primaryMetrics ?? [])];
  if (primaryMetrics.length >= 3) {
    throw new Error(
      'This experiment already has the maximum of 3 primary metrics.'
    );
  }
  primaryMetrics.push(metric);
  const updated = await updateFlag(client, projectId, flagSlug, {
    experiment: {
      ...exp,
      primaryMetrics,
    },
  });
  return { flag: updated, metric };
}

export async function listExperimentMetricsForFlag(
  client: Client,
  projectId: string,
  flagSlug: string
): Promise<{
  primary: MetricDefinition[];
  guardrail: MetricDefinition[];
}> {
  const flag = await getFlag(client, projectId, flagSlug);
  if (!flag.experiment) {
    throw new Error(`Flag "${flagSlug}" has no experiment configuration.`);
  }
  return {
    primary: flag.experiment.primaryMetrics ?? [],
    guardrail: flag.experiment.guardrailMetrics ?? [],
  };
}
