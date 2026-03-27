/** JSON flag variant payload for experiment flags (`kind: "json"`). */
export interface JsonVariantValue {
  variantId: string;
  params?: Record<string, unknown>;
}

export interface FlagVariant {
  id: string;
  value: string | number | boolean | JsonVariantValue;
  label?: string;
  description?: string;
}

export interface FlagOutcome {
  type: 'variant';
  variantId: string;
}

export interface FlagSplitOutcome {
  type: 'split';
  /** Allocation base (entity accessor or experiment shorthand e.g. `{ type: 'visitor' }`). */
  base:
    | {
        type: 'entity';
        kind: string;
        attribute: string;
      }
    | { type: string; kind?: string; attribute?: string };
  weights: Record<string, number>;
  defaultVariantId: string;
}

export interface FlagCondition {
  lhs:
    | { type: 'segment' }
    | { type: 'entity'; kind: string; attribute: string };
  cmp: string;
  rhs?: string | number | boolean | { type: string; items?: unknown[] };
}

export interface FlagRule {
  id: string;
  conditions: FlagCondition[];
  outcome: FlagOutcome | FlagSplitOutcome;
}

export interface FlagEnvironmentConfig {
  active: boolean;
  reuse?: {
    active: boolean;
    environment: string;
  };
  pausedOutcome?: FlagOutcome;
  fallthrough: FlagOutcome | FlagSplitOutcome;
  rules: FlagRule[];
  targets?: Record<
    string,
    Record<string, Record<string, Array<{ value: string; note?: string }>>>
  >;
  revision?: number;
}

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'closed';

export type ExperimentAllocationUnit = 'cookieId' | 'visitorId' | 'userId';

/**
 * Experiment configuration stored on a feature flag (A/B tests).
 * @see Vercel API feature-flags experiment schema
 */
export interface ExperimentConfig {
  name?: string;
  allocationUnit: ExperimentAllocationUnit;
  numVariants?: number;
  surfaceArea?: string;
  stickyRequirement?: boolean;
  layer?: string;
  primaryMetricIds: string[];
  guardrailMetricIds?: string[];
  status: ExperimentStatus;
  owner?: string;
  hypothesis?: string;
  device?: 'android' | 'ios' | 'desktop' | 'mweb';
  controlVariantId?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface Flag {
  id: string;
  slug: string;
  description?: string;
  kind: 'boolean' | 'string' | 'number' | 'json';
  state: 'active' | 'archived';
  variants: FlagVariant[];
  environments: Record<string, FlagEnvironmentConfig>;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  projectId: string;
  ownerId: string;
  revision: number;
  seed: number;
  typeName: 'flag';
  experiment?: ExperimentConfig;
  metadata?: {
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface FlagsListResponse {
  data: Flag[];
}

export interface FlagVersion {
  id: string;
  revision: number;
  createdAt: number;
  createdBy: string;
  message?: string;
  data: {
    description?: string;
    variants: FlagVariant[];
    environments: Record<string, FlagEnvironmentConfig>;
  };
}

export interface FlagVersionsResponse {
  versions: FlagVersion[];
}

export interface SdkKey {
  hashKey: string;
  projectId: string;
  type: 'server' | 'mobile' | 'client';
  environment: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  label?: string;
  deletedAt?: number;
  keyValue?: string;
  tokenValue?: string;
  connectionString?: string;
}

export interface SdkKeysListResponse {
  data: SdkKey[];
}

export interface CreateFlagRequest {
  slug: string;
  kind: 'boolean' | 'string' | 'number' | 'json';
  description?: string;
  variants?: FlagVariant[];
  environments: Record<string, FlagEnvironmentConfig>;
  /** Required for split / experiment flags. */
  seed?: number;
  experiment?: ExperimentConfig;
}

export interface UpdateFlagRequest {
  message?: string;
  createdBy?: string;
  variants?: FlagVariant[];
  environments?: Record<string, Partial<FlagEnvironmentConfig>>;
  state?: 'active' | 'archived';
  experiment?: Partial<ExperimentConfig>;
}

export type MetricType = 'percentage' | 'currency' | 'count';

export type MetricUnit = 'user' | 'session' | 'visitor';

export type MetricDirectionality = 'increaseIsGood' | 'decreaseIsGood';

/** Experiment metric (Web Analytics / Tinybird). */
export interface ExperimentMetric {
  typeName: 'metric';
  id: string;
  slug: string;
  projectId: string;
  name: string;
  description?: string;
  metricType: MetricType;
  metricUnit: MetricUnit;
  directionality: MetricDirectionality;
  metricFormula?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  usedByFlags?: string[];
}

export interface ExperimentMetricsListResponse {
  data: ExperimentMetric[];
}

export interface PutExperimentMetricRequest {
  slug: string;
  name: string;
  description?: string;
  metricType: MetricType;
  metricUnit: MetricUnit;
  directionality: MetricDirectionality;
  metricFormula?: string;
}

export interface CreateSdkKeyRequest {
  sdkKeyType: 'server' | 'mobile' | 'client';
  environment: string;
  label?: string;
}

// Flag Settings types
export interface FlagSettingsAttributeLabel {
  value: string;
  label: string;
}

export interface FlagSettingsAttribute {
  key: string;
  type: string;
  labels?: FlagSettingsAttributeLabel[];
}

export interface FlagSettingsEntity {
  kind: string;
  label: string;
  attributes: FlagSettingsAttribute[];
}

export interface FlagSettings {
  typeName: 'settings';
  projectId: string;
  enabled: boolean;
  environments: string[];
  entities: FlagSettingsEntity[];
}
