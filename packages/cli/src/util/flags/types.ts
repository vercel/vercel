export interface FlagVariant {
  id: string;
  value: string | number | boolean;
  label?: string;
  description?: string;
}

export interface FlagOutcome {
  type: 'variant';
  variantId: string;
}

export interface FlagSplitOutcome {
  type: 'split';
  base: {
    type: 'entity';
    kind: string;
    attribute: string;
  };
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

export interface Flag {
  id: string;
  slug: string;
  description?: string;
  kind: 'boolean' | 'string' | 'number';
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
  kind: 'boolean' | 'string' | 'number';
  description?: string;
  variants?: FlagVariant[];
  environments: Record<string, FlagEnvironmentConfig>;
}

export interface UpdateFlagRequest {
  message?: string;
  createdBy?: string;
  variants?: FlagVariant[];
  environments?: Record<string, Partial<FlagEnvironmentConfig>>;
  state?: 'active' | 'archived';
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
