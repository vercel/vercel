import type Client from '../client';
import { buildCommandWithGlobalFlags } from '../agent-output';
import { quoteArg } from './quote-arg';
import type {
  MetricsQueryResponse,
  ProjectScope,
} from '../../commands/metrics/types';

const METRICS_URL = 'https://vercel.com/api/observability/metrics';
const EVALUATION_ROLLUP = 'vercel_flag_evaluation_flag_evaluations_sum';
const LOOKBACK_HOURS = 72;

type FlagSafetyBlockerKind =
  | 'evaluations'
  | 'evaluations-unavailable'
  | 'reference'
  | 'reference-unavailable';

export type FlagSafetyBlocker = {
  kind: FlagSafetyBlockerKind;
  message: string;
};

function metricsUrl(ownerId: string): string {
  const url = new URL(
    process.env.VERCEL_FLAG_EVALUATIONS_API_URL || METRICS_URL
  );
  url.searchParams.set('ownerId', ownerId);
  return url.href;
}

async function productionEvaluationBlocker(
  client: Client,
  projectId: string,
  ownerId: string,
  slug: string
): Promise<FlagSafetyBlocker | undefined> {
  // Calculate exactly 72 hours back from a single aligned boundary
  const now = Date.now();
  const alignedEnd = Math.ceil(now / 3_600_000) * 3_600_000;
  const startTime = new Date(alignedEnd - LOOKBACK_HOURS * 3_600_000);
  const endTime = new Date(alignedEnd);
  const scope: ProjectScope = {
    type: 'project',
    ownerId,
    projectIds: [projectId],
  };

  try {
    const response = await client.fetch<MetricsQueryResponse>(
      metricsUrl(ownerId),
      {
        method: 'POST',
        body: JSON.stringify({
          scope,
          // The metrics API currently accepts this registered query reason.
          reason: 'flag_evaluation_chart',
          event: 'flagEvaluation',
          rollups: {
            [EVALUATION_ROLLUP]: {
              measure: 'flagEvaluations',
              aggregation: 'sum',
            },
          },
          granularity: { hours: 1 },
          // Request one ungrouped total. A grouped, limited response can omit
          // variants and make a destructive-operation warning undercount.
          groupBy: [],
          summaryOnly: true,
          filter:
            `flagKey eq '${slug.replace(/'/g, "''")}' and ` +
            "(environment eq 'production' or sdkKeyEnvironment eq 'production')",
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
        headers: { 'Content-Type': 'application/json' },
        useCurrentTeam: false,
        bailOn429: true,
      }
    );
    const count = response.summary.reduce((total, row) => {
      const value = row[EVALUATION_ROLLUP];
      if (typeof value === 'number') {
        return total + value;
      }
      // Handle numeric strings that the metrics API sometimes returns
      if (typeof value === 'string') {
        const parsed = Number(value);
        return total + (Number.isFinite(parsed) ? parsed : 0);
      }
      return total;
    }, 0);
    return count
      ? {
          kind: 'evaluations',
          message: `${count} production evaluation${count === 1 ? '' : 's'} in the last ${LOOKBACK_HOURS} hours`,
        }
      : undefined;
  } catch {
    return {
      kind: 'evaluations-unavailable',
      message: 'could not verify production evaluation activity',
    };
  }
}

async function productionReferenceBlocker(
  client: Client,
  projectId: string,
  slug: string
): Promise<FlagSafetyBlocker | undefined> {
  try {
    // This endpoint identifies the deployment currently serving Production,
    // unlike the deployment-list endpoint which only returns historical targets.
    const { deployment } = await client.fetch<{
      deployment: { id: string } | null;
    }>(`/projects/${encodeURIComponent(projectId)}/production-deployment`);
    if (!deployment?.id) {
      return {
        kind: 'reference-unavailable',
        message: 'could not find the active production deployment',
      };
    }

    const response = await client.fetch<{
      flags?: Array<{ slug: string; projectMismatch?: boolean }>;
      status?: { responseStatus: number } | null;
    }>(`/v1/deployments/${encodeURIComponent(deployment.id)}/feature-flags`);

    // `responseStatus` is the status of feature-flag discovery in the
    // deployment sync. Missing status, null status, or non-200 status
    // means discovery did not complete, so fail closed.
    if (
      !response.status ||
      response.status.responseStatus !== 200 ||
      !Array.isArray(response.flags)
    ) {
      return {
        kind: 'reference-unavailable',
        message:
          'could not verify feature flag discovery status on the active production deployment',
      };
    }

    return response.flags.some(
      item => item.slug === slug && !item.projectMismatch
    )
      ? {
          kind: 'reference',
          message:
            'the active production deployment still references this flag',
        }
      : undefined;
  } catch {
    return {
      kind: 'reference-unavailable',
      message: 'could not verify the active production deployment',
    };
  }
}

/** Returns reasons to stop a destructive flag operation; unavailable checks block. */
export async function getFlagSafetyBlockers({
  client,
  projectId,
  ownerId,
  slug,
}: {
  client: Client;
  projectId: string;
  ownerId: string;
  slug: string;
}): Promise<FlagSafetyBlocker[]> {
  const blockers = await Promise.all([
    productionEvaluationBlocker(client, projectId, ownerId, slug),
    productionReferenceBlocker(client, projectId, slug),
  ]);
  return blockers.filter((blocker): blocker is FlagSafetyBlocker =>
    Boolean(blocker)
  );
}

/** Explains the next safe action for the checks that blocked deletion. */
export function getFlagSafetyRemediation(
  blockers: FlagSafetyBlocker[]
): string {
  const kinds = new Set(blockers.map(blocker => blocker.kind));
  const hasEvaluations = kinds.has('evaluations');
  const hasReference = kinds.has('reference');

  if (hasEvaluations && hasReference) {
    return 'Remove this flag from your application code, deploy the change to Production, and wait for evaluation activity to stop, then try again.';
  }
  if (hasEvaluations) {
    return 'Wait for Production evaluation activity to stop, then try again.';
  }
  if (hasReference) {
    return 'Remove this flag from your application code and deploy the change to Production, then try again.';
  }
  return 'Resolve the Production safety-check issues above, then try again.';
}

/** Builds an actionable override command while retaining the caller's global context. */
export function buildFlagSafetyRetryCommand({
  client,
  operation,
  slug,
  includeYes,
}: {
  client: Client;
  operation: 'archive' | 'rm';
  slug: string;
  includeYes: boolean;
}): string {
  return buildCommandWithGlobalFlags(
    client.argv,
    `flags ${operation} ${quoteArg(slug)}${includeYes ? ' --yes' : ''} --dangerously-force`,
    undefined,
    { preserveProject: true }
  );
}

/** Formats a consistent destructive-operation error from Production safety checks. */
export function formatFlagSafetyFailure({
  flagName,
  operation,
  blockers,
  retryCommand,
  detectedAfterConfirmation = false,
}: {
  flagName: string;
  operation: 'archive' | 'delete';
  blockers: FlagSafetyBlocker[];
  retryCommand: string;
  detectedAfterConfirmation?: boolean;
}): string {
  const state = detectedAfterConfirmation ? 'is now' : 'may still be';
  const pastTenseOperation = operation === 'archive' ? 'archived' : 'deleted';

  return [
    `Flag ${flagName} ${state} in use in Production and can't be ${pastTenseOperation}.`,
    ...blockers.map(blocker => `- ${blocker.message}`),
    '',
    getFlagSafetyRemediation(blockers),
    `To override this check, rerun with ${retryCommand}`,
  ].join('\n');
}
