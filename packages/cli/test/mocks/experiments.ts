import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { client } from './client';
import type {
  Experiment,
  ExperimentAction,
  ExperimentAnalysis,
} from '../../src/commands/experiments/types';

const now = Date.now();

export const defaultExperiments: Experiment[] = [
  {
    typeName: 'experiment',
    id: 'exp_running',
    projectId: 'vercel-flags-test',
    flagId: 'flag_checkout',
    flagSlug: 'checkout-copy-flag',
    name: 'Checkout copy',
    slug: 'checkout-copy',
    hypothesis: 'Shorter copy increases checkout conversion',
    kind: 'boolean',
    base: { type: 'entity', kind: 'user', attribute: 'id' },
    variants: [
      { id: 'control', value: false, label: 'Control' },
      { id: 'treatment', value: true, label: 'Treatment' },
    ],
    controlVariantId: 'control',
    weights: { control: 50, treatment: 50 },
    metrics: {
      conversion: { type: 'conversion', eventName: 'checkout' },
      revenue: {
        type: 'mean',
        eventName: 'purchase',
        valueField: 'revenue',
      },
      errors: { type: 'conversion', eventName: 'checkout_error' },
    },
    primaryMetric: 'conversion',
    secondaryMetrics: ['revenue'],
    guardrailMetrics: ['errors'],
    targetPercentage: 100,
    state: 'running',
    rampId: 'rmp_current',
    rampPercentage: 25,
    enrollmentSeed: 1234,
    epochs: [
      {
        rampId: 'rmp_current',
        startedAt: now - 86_400_000,
        ramps: [{ rampPercentage: 25, startedAt: now - 86_400_000 }],
      },
    ],
    createdAt: now - 172_800_000,
    createdBy: 'user_123',
    updatedAt: now - 3_600_000,
    updatedBy: 'user_123',
    launchedAt: now - 86_400_000,
  },
  {
    typeName: 'experiment',
    id: 'exp_draft',
    projectId: 'vercel-flags-test',
    flagId: 'flag_search',
    flagSlug: 'search-layout-flag',
    name: 'Search layout',
    slug: 'search-layout',
    kind: 'string',
    base: { type: 'entity', kind: 'device', attribute: 'id' },
    variants: [
      { id: 'control', value: 'grid' },
      { id: 'list', value: 'list' },
    ],
    controlVariantId: 'control',
    weights: { control: 50, list: 50 },
    metrics: {
      engagement: { type: 'conversion', eventName: 'search_result_click' },
    },
    primaryMetric: 'engagement',
    targetPercentage: 100,
    state: 'draft',
    enrollmentSeed: 4321,
    epochs: [],
    createdAt: now - 43_200_000,
    createdBy: 'user_123',
    updatedAt: now - 43_200_000,
    updatedBy: 'user_123',
  },
];

export const defaultExperimentAnalysis: ExperimentAnalysis = {
  version: 3,
  controlVariantId: 'control',
  excludeContaminated: false,
  rampId: 'rmp_current',
  variants: [
    {
      variantId: 'control',
      uniqueUnits: 100,
      firstSeen: new Date(now - 86_400_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
      daysActive: 1,
      unitsPerDay: 100,
    },
    {
      variantId: 'treatment',
      uniqueUnits: 100,
      firstSeen: new Date(now - 86_400_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
      daysActive: 1,
      unitsPerDay: 100,
    },
  ],
  contamination: { totalUnits: 200, contaminatedUnits: 1 },
  metrics: {
    conversion: {
      type: 'conversion',
      variants: [
        {
          variantId: 'control',
          isBaseline: true,
          exposedUnits: 100,
          conversionRate: 0.1,
          lift: null,
          confidenceInterval: null,
          pValue: null,
          isSignificant: false,
          requiredSampleSize: null,
        },
        {
          variantId: 'treatment',
          isBaseline: false,
          exposedUnits: 100,
          conversionRate: 0.12,
          lift: 0.2,
          confidenceInterval: { lower: 0.002, upper: 0.038 },
          pValue: 0.04,
          isSignificant: true,
          requiredSampleSize: 80,
        },
      ],
    },
    revenue: {
      type: 'mean',
      variants: [
        {
          variantId: 'control',
          isBaseline: true,
          exposedUnits: 100,
          mean: 10,
          lift: null,
          confidenceInterval: null,
          pValue: null,
          isSignificant: false,
          requiredSampleSize: null,
        },
        {
          variantId: 'treatment',
          isBaseline: false,
          exposedUnits: 100,
          mean: 11,
          lift: 0.1,
          confidenceInterval: { lower: -0.5, upper: 2.5 },
          pValue: 0.2,
          isSignificant: false,
        },
      ],
    },
    errors: {
      type: 'conversion',
      variants: [
        {
          variantId: 'control',
          isBaseline: true,
          exposedUnits: 100,
          conversionRate: 0.01,
          lift: null,
          confidenceInterval: null,
          pValue: null,
          isSignificant: false,
        },
        {
          variantId: 'treatment',
          isBaseline: false,
          exposedUnits: 100,
          conversionRate: 0.011,
          lift: 0.1,
          confidenceInterval: { lower: -0.01, upper: 0.012 },
          pValue: 0.8,
          isSignificant: false,
          requiredSampleSize: 80,
        },
      ],
    },
  },
  primaryMetric: 'conversion',
  timeseries: null,
  srm: {
    variants: [
      { variantId: 'control', uniqueUnits: 100 },
      { variantId: 'treatment', uniqueUnits: 100 },
    ],
    pValue: 1,
    isValid: true,
  },
  warnings: [],
};

export function useExperiments(
  initial: Experiment[] = defaultExperiments,
  analysis: ExperimentAnalysis = defaultExperimentAnalysis,
  onAnalysis?: (body: Record<string, unknown>) => void,
  options: { experimentsEnabled?: boolean; analysisEnabled?: boolean } = {}
) {
  const experiments = structuredClone(initial);
  const experimentsEnabled = options.experimentsEnabled ?? true;
  const analysisEnabled = options.analysisEnabled ?? experimentsEnabled;
  const denyAccess = (res: Response) =>
    res.status(403).json({
      error: {
        code: 'forbidden',
        message: 'Experiments are not enabled for this team.',
      },
    });

  client.scenario.get(
    '/v1/projects/:projectId/feature-flags/experiments',
    (_req, res) =>
      experimentsEnabled ? res.json({ data: experiments }) : denyAccess(res)
  );
  client.scenario.get(
    '/v1/projects/:projectId/feature-flags/experiments/:experiment',
    (req, res) => {
      if (!experimentsEnabled) return denyAccess(res);
      const experiment = experiments.find(
        item =>
          item.id === req.params.experiment ||
          item.slug === req.params.experiment
      );
      experiment
        ? res.json(experiment)
        : res.status(404).json({ error: { message: 'Experiment not found' } });
    }
  );
  client.scenario.put(
    '/v1/projects/:projectId/feature-flags/experiments',
    (req, res) => {
      if (!experimentsEnabled) return denyAccess(res);
      const created = {
        ...structuredClone(defaultExperiments[1]),
        ...req.body,
        id: `exp_${randomUUID()}`,
        flagId: `flag_${randomUUID()}`,
        state: 'draft',
      } as Experiment;
      experiments.push(created);
      res.status(201).json(created);
    }
  );
  client.scenario.patch(
    '/v1/projects/:projectId/feature-flags/experiments/:experiment',
    (req, res) => {
      if (!experimentsEnabled) return denyAccess(res);
      const index = experiments.findIndex(
        item =>
          item.id === req.params.experiment ||
          item.slug === req.params.experiment
      );
      if (index < 0) {
        res.status(404).json({ error: { message: 'Experiment not found' } });
        return;
      }
      const current = experiments[index];
      const rampId = req.body.restartAnalysis
        ? `rmp_${randomUUID()}`
        : current.rampId;
      experiments[index] = {
        ...current,
        ...req.body,
        rampId,
        epochs: req.body.restartAnalysis
          ? [
              ...current.epochs.map(epoch => ({ ...epoch, endedAt: now })),
              {
                rampId,
                startedAt: now,
                ramps: [
                  {
                    rampPercentage: current.rampPercentage ?? 0,
                    startedAt: now,
                  },
                ],
              },
            ]
          : current.epochs,
      };
      delete (experiments[index] as Experiment & { restartAnalysis?: boolean })
        .restartAnalysis;
      res.json(experiments[index]);
    }
  );
  client.scenario.post(
    '/v1/projects/:projectId/feature-flags/experiments/:experiment/actions',
    (req, res) => {
      if (!experimentsEnabled) return denyAccess(res);
      const index = experiments.findIndex(
        item =>
          item.id === req.params.experiment ||
          item.slug === req.params.experiment
      );
      if (index < 0) {
        res.status(404).json({ error: { message: 'Experiment not found' } });
        return;
      }
      const current = experiments[index];
      const action = req.body as ExperimentAction;
      let updated = structuredClone(current);
      if (action.action === 'start') {
        const rampId = `rmp_${randomUUID()}`;
        updated = {
          ...updated,
          state: 'running',
          rampId,
          rampPercentage: action.rampPercentage,
          epochs: [
            ...updated.epochs,
            {
              rampId,
              startedAt: now,
              ramps: [
                { rampPercentage: action.rampPercentage, startedAt: now },
              ],
            },
          ],
        };
      } else if (action.action === 'set-ramp') {
        updated.rampPercentage = action.rampPercentage;
      } else if (action.action === 'return-to-draft') {
        updated.state = 'draft';
        updated.rampId = undefined;
        updated.rampPercentage = undefined;
      } else if (action.action === 'reseed-enrollment') {
        updated.enrollmentSeed += 1;
      } else if (action.action === 'complete') {
        updated.state = 'completed';
        updated.decision = {
          outcome: action.outcome,
          winnerVariantId: action.winnerVariantId,
          rationale: action.rationale,
          decidedAt: now,
          decidedBy: 'user_123',
        };
      }
      experiments[index] = updated;
      res.json(updated);
    }
  );
  client.scenario.delete(
    '/v1/projects/:projectId/feature-flags/experiments/:experiment',
    (req, res) => {
      if (!experimentsEnabled) return denyAccess(res);
      const index = experiments.findIndex(
        item =>
          item.id === req.params.experiment ||
          item.slug === req.params.experiment
      );
      if (index < 0) {
        res.status(404).json({ error: { message: 'Experiment not found' } });
        return;
      }
      experiments.splice(index, 1);
      res.status(204).send();
    }
  );
  client.scenario.post(
    '/v3/projects/:projectId/experiments/:experiment/results',
    (req, res) => {
      if (!analysisEnabled) return denyAccess(res);
      onAnalysis?.(req.body as Record<string, unknown>);
      res.json(analysis);
    }
  );

  return experiments;
}

export interface ExperimentEventScenario {
  exposures?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  onQuery?: (body: Record<string, unknown>) => void;
  /** Overrides the route the scenario answers on. */
  path?: string;
  /** Answers each successive call with the next page, for tail tests. */
  pages?: Record<string, unknown>[][];
  /** Answers with this status instead of rows, for refusal tests. */
  status?: number;
}

export interface MicrofrontendsScenario {
  /** Group members, in the shape the groups endpoint returns. */
  projects: {
    id: string;
    microfrontends?: Record<string, unknown>;
  }[];
}

export function useMicrofrontends(scenario?: MicrofrontendsScenario) {
  client.scenario.get('/v1/microfrontends/groups', (_req, res) =>
    res.json({ groups: scenario ? [{ projects: scenario.projects }] : [] })
  );
}

export function useExperimentEvents({
  exposures = [],
  events = [],
  onQuery,
  path = '/v1/observability/events',
  pages,
  status,
}: ExperimentEventScenario = {}) {
  let call = 0;
  client.scenario.post(path, (req, res) => {
    onQuery?.(req.body);
    if (status !== undefined) {
      res
        .status(status)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } });
      return;
    }
    if (pages) {
      // Successive tail polls, so a test can assert what the second poll does
      // with rows the first already printed.
      const page = pages[Math.min(call, pages.length - 1)];
      call += 1;
      res.json({
        events: page,
        pagination: { hasMore: false, nextCursor: null },
      });
      return;
    }
    const filter = String(req.body?.filter ?? '');
    const wantsExposures = filter.includes('type:exposure');
    const wantsEvents = filter.includes('type:event');
    const rows = [
      ...(wantsExposures ? exposures : []),
      ...(wantsEvents ? events : []),
    ].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    res.json({
      events: rows,
      pagination: { hasMore: false, nextCursor: null },
    });
  });
}
