import type { JSONValue } from '@vercel-internals/types';
import type { FlagConditionComparator } from './comparators';

export type FlagKind = 'boolean' | 'string' | 'number' | 'json';

export type FlagVariantValue = JSONValue;

export interface FlagVariant {
  id: string;
  value: FlagVariantValue;
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

export interface FlagRolloutOutcome {
  type: 'rollout';
  base: {
    type: 'entity';
    kind: string;
    attribute: string;
  };
  startTimestamp: number;
  rollFromVariantId: string;
  rollToVariantId: string;
  defaultVariantId: string;
  slots: Array<{
    durationMs: number;
    promille: number;
  }>;
}

export interface FlagCondition {
  lhs:
    | { type: 'segment' }
    | { type: 'entity'; kind: string; attribute: string };
  cmp: string;
  cmpOptions?: {
    ignoreCase?: boolean;
  };
  rhs?: string | number | boolean | { type: string; items?: unknown[] };
}

export interface FlagRule {
  id: string;
  conditions: FlagCondition[];
  outcome: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome;
}

export interface FlagEnvironmentConfig {
  active: boolean;
  reuse?: {
    active: boolean;
    environment: string;
  };
  pausedOutcome?: FlagOutcome;
  fallthrough: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome;
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
  kind: FlagKind;
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
  // Server-masked preview of the key value, e.g. `vf_server_abc********`.
  // Safe to display; never contains the full secret.
  partialKeyValue?: string;
}

// Returned only from the create endpoint, where the API reveals the
// plaintext key once. The list endpoint never returns these fields, and the
// CLI must never emit them in `flags sdk-keys ls` output (table or JSON).
export interface CreatedSdkKey extends SdkKey {
  keyValue?: string;
  tokenValue?: string;
  connectionString?: string;
}

export interface SdkKeysListResponse {
  data: SdkKey[];
}

export interface CreateFlagRequest {
  slug: string;
  kind: FlagKind;
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

export type SegmentComparator = FlagConditionComparator;

export type SegmentListItem = {
  value: string | number;
  label?: string;
  note?: string;
};

export type SegmentConditionValue =
  | string
  | number
  | boolean
  | {
      type: 'list' | 'list/inline';
      items: SegmentListItem[];
    }
  | {
      type: 'regex';
      pattern: string;
      flags: string;
    };

export interface SegmentCondition {
  lhs:
    | { type: 'segment' }
    | { type: 'entity'; kind: string; attribute: string };
  cmp: SegmentComparator;
  rhs?: SegmentConditionValue;
  cmpOptions?: {
    ignoreCase?: boolean;
  };
}

export type SegmentRuleOutcome =
  | { type: 'all' }
  | {
      type: 'split';
      base: {
        type: 'entity';
        kind: string;
        attribute: string;
      };
      passPromille: number;
    };

export interface SegmentRule {
  id: string;
  conditions: SegmentCondition[];
  outcome: SegmentRuleOutcome;
}

export type SegmentValue = {
  value: string;
  note?: string;
};

export type SegmentMembershipMap = Record<
  string,
  Record<string, SegmentValue[]>
>;

export interface SegmentData {
  rules?: SegmentRule[];
  include?: SegmentMembershipMap;
  exclude?: SegmentMembershipMap;
}

export interface Segment {
  id: string;
  label: string;
  slug: string;
  description?: string;
  createdBy?: string;
  usedByFlags?: string[];
  usedBySegments?: string[];
  createdAt: number;
  updatedAt: number;
  projectId: string;
  typeName: 'segment';
  data: SegmentData;
  hint: string;
  metadata?: {
    creator?: {
      id: string;
      name: string;
    };
  };
}

export interface SegmentsListResponse {
  data: Segment[];
}

export interface CreateSegmentRequest {
  slug: string;
  label: string;
  description?: string;
  data: SegmentData;
  hint: string;
  createdBy?: string;
}

export type SegmentOperationAction = 'add' | 'remove';

export interface SegmentMembershipOperation {
  action: SegmentOperationAction;
  field: 'include' | 'exclude';
  entity: string;
  attribute: string;
  value: SegmentValue;
}

export type SegmentRuleOperation =
  | {
      action: 'add';
      field: 'rule';
      rule: SegmentRule;
    }
  | {
      action: 'remove';
      field: 'rule';
      rule?: SegmentRule;
      ruleId?: string;
    };

export type SegmentOperation =
  | SegmentMembershipOperation
  | SegmentRuleOperation;

export interface UpdateSegmentRequest {
  label?: string;
  description?: string;
  data?: SegmentData;
  hint?: string;
  operations?: SegmentMembershipOperation[];
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
