export type ExperimentState = 'draft' | 'running' | 'completed';

export interface ExperimentVariant {
  id: string;
  value: unknown;
  label?: string;
}

export interface ExperimentMetric {
  type: 'conversion' | 'mean' | 'funnel' | 'ratio' | 'retention';
  [key: string]: unknown;
}

export interface ExperimentEpoch {
  rampId: string;
  startedAt: number;
  endedAt?: number;
  ramps: Array<{ rampPercentage: number; startedAt: number }>;
}

export interface Experiment {
  typeName: 'experiment';
  id: string;
  projectId: string;
  flagId: string;
  flagSlug: string;
  name: string;
  slug?: string;
  hypothesis?: string;
  kind: string;
  base: { type: 'entity'; kind: string; attribute: string };
  variants: ExperimentVariant[];
  controlVariantId: string;
  weights: Record<string, number>;
  conditions?: unknown[];
  metrics?: Record<string, ExperimentMetric>;
  primaryMetric?: string;
  secondaryMetrics?: string[];
  guardrailMetrics?: string[];
  targetPercentage: number;
  state: ExperimentState;
  rampId?: string;
  rampPercentage?: number;
  enrollmentSeed: number;
  epochs: ExperimentEpoch[];
  stopReason?: string;
  stopCause?: 'manual' | 'guardrail' | 'srm';
  decision?: {
    outcome: 'winner' | 'abandon';
    winnerVariantId?: string;
    rationale: string;
    decidedAt: number;
    decidedBy: string;
  };
  previousExperimentId?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  launchedAt?: number;
  stoppedAt?: number;
  completedAt?: number;
}

export type ExperimentAction =
  | { action: 'start'; rampPercentage: number }
  | { action: 'set-ramp'; rampPercentage: number }
  | { action: 'reseed-enrollment' }
  | {
      action: 'return-to-draft';
      cause?: 'manual' | 'guardrail' | 'srm';
      reason?: string;
    }
  | {
      action: 'complete';
      outcome: 'winner' | 'abandon';
      winnerVariantId?: string;
      rationale: string;
    };

export interface ExperimentAnalysis {
  version: 3;
  controlVariantId: string;
  excludeContaminated: boolean;
  rampId: string;
  variants: Array<{
    variantId: string;
    uniqueUnits: number;
    firstSeen: string;
    lastSeen: string;
    daysActive: number;
    unitsPerDay: number;
  }>;
  contamination: { totalUnits: number; contaminatedUnits: number };
  metrics: Record<
    string,
    {
      type: ExperimentMetric['type'];
      variants: Array<{
        variantId: string;
        isBaseline: boolean;
        exposedUnits: number;
        lift: number | null;
        confidenceInterval: { lower: number; upper: number } | null;
        pValue: number | null;
        isSignificant: boolean;
        requiredSampleSize?: number | null;
        conversionRate?: number;
        overallRate?: number;
        mean?: number;
        ratio?: number | null;
        retentionRate?: number;
      }>;
      [key: string]: unknown;
    }
  >;
  primaryMetric: string | null;
  timeseries: unknown;
  srm: {
    variants: Array<{ variantId: string; uniqueUnits: number }>;
    pValue: number;
    isValid: boolean;
  };
  warnings: string[];
}

export interface ExperimentAnalysisAssessment {
  trust: {
    status: 'passed' | 'directional' | 'caution' | 'failed';
    summary: string;
    reasons: Array<
      | 'sample_ratio_mismatch'
      | 'exposure_invariant_failed'
      | 'contamination_included'
      | 'insufficient_sample_size'
    >;
  };
  sampleSize: {
    status: 'insufficient' | 'no_insufficiency_detected' | 'unavailable';
    issues: Array<{
      metric: string;
      role: string;
      variantId: string;
      controlUnits: number;
      variantUnits: number;
      requiredUnitsPerArm: number;
      remainingUnitsInSmallerArm: number;
    }>;
  };
}

export interface NextCommand {
  label: string;
  command: string;
}

export type WebAnalyticsEventType = 'pageview' | 'event' | 'exposure';

export interface AnalyticsEventRow {
  timestamp: string;
  type: WebAnalyticsEventType;
  eventName?: string;
  eventData?: string;
}

export interface AnalyticsEventsResponse {
  events: AnalyticsEventRow[];
}

export interface DiagnosedEvent {
  timestamp: string;
  kind: 'exposure' | 'event';
  /**
   * Metric event name. Unset for an exposure, whose name only ever repeats the
   * experiment ID.
   */
  name?: string;
  /** The experiment unit, which is what ties an exposure to a metric event. */
  unit?: string;
  variantId?: string;
  /** Ramp that assigned an exposure. */
  rampId?: string;
  /** Set when an exposure was not assigned by the experiment itself. */
  assignmentReason?: string;
  payload?: Record<string, unknown>;
}

export interface ExperimentDiagnosis {
  /** Exposures and metric events interleaved, newest first. */
  events: DiagnosedEvent[];
  /** Project the rows were read from; a microfrontend child resolves to its default app. */
  projectId: string;
  exposureCount: number;
  metricEventCount: number;
  /** Distinct units the experiment enrolled, counted the way `analyze` counts them. */
  enrolledUnits: number;
  /** Exposures assigned for another reason, such as falling outside the ramp. */
  notEnrolledExposures: number;
  metricEventNames: string[];
  /** `eventData` field holding the unit, taken from the exposures themselves. */
  unitField: string;
  /** Set when the page filled `--limit`, so older rows exist. */
  truncated: boolean;
  /** Exposures assigned by a ramp other than the current one. */
  staleRampExposures: number;
  window: { start: string; end: string };
}
