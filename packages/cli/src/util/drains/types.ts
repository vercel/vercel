export type DrainStatus = 'enabled' | 'disabled' | 'errored';

export type DrainDisabledReason =
  | 'disabled-by-owner'
  | 'feature-not-available'
  | 'account-plan-downgrade'
  | 'disabled-by-admin';

export type DrainSchemaName =
  | 'log'
  | 'trace'
  | 'analytics'
  | 'speed_insights'
  | 'ai_gateway'
  | 'audit_log'
  | 'connect';
export type DrainSchemas = Partial<
  Record<DrainSchemaName, { version: string }>
>;

// `secret` may be a real string OR an integration-managed placeholder object.
// Neither is ever rendered raw: a string is masked, the object shows a label.
export type DrainSecret = string | { kind: 'INTEGRATION_SECRET' };

// delivery: discriminated union on `type`, mirroring the API's DrainDelivery.
export interface DrainDeliveryHttp {
  type: 'http';
  endpoint: string;
  encoding: 'json' | 'ndjson';
  compression?: 'gzip' | 'none';
  headers: Record<string, string>; // values SENSITIVE
  secret?: DrainSecret; // SENSITIVE
}
export interface DrainDeliveryOtlpHttp {
  type: 'otlphttp';
  endpoint: { traces: string }; // note: object, not a bare string
  encoding: 'proto' | 'json';
  headers: Record<string, string>; // values SENSITIVE
  secret?: DrainSecret; // SENSITIVE
}
export interface DrainDeliveryClickhouse {
  type: 'clickhouse';
  endpoint: string;
  table: string;
}
export interface DrainDeliveryS3 {
  type: 's3';
  endpoint: string;
  encoding: 'json' | 'ndjson';
  compression: 'none';
  fileStructure: 'hive';
  roleArn: string;
  region: string;
  serverSideEncryption?: 'AES256' | 'aws:kms' | 'aws:kms:dsse';
  objectAcl?: 'private' | 'bucket-owner-read' | 'bucket-owner-full-control';
}
// `internal` (target: 'vercel-otel-traces-db') is the tracing drain that is
// filtered out server-side and never reaches the CLI. Modeled only so the
// delivery switch stays exhaustive.
export interface DrainDeliveryInternal {
  type: 'internal';
  target: 'vercel-otel-traces-db';
}
export type DrainDelivery =
  | DrainDeliveryHttp
  | DrainDeliveryOtlpHttp
  | DrainDeliveryClickhouse
  | DrainDeliveryS3
  | DrainDeliveryInternal;

export interface DrainSamplingRule {
  type: string;
  rate: number; // 0..1
  env?: 'production' | 'preview';
  requestPath?: string;
}
export type DrainSampling = DrainSamplingRule[];

export type DrainSource =
  | { kind: 'self-served' }
  | {
      kind: 'integration';
      integrationConfigurationId?: string;
      integrationId?: string;
    }
  | { kind: 'system' };

export type DrainFilter =
  | { type: 'basic'; [k: string]: unknown }
  | { type: 'odata'; [k: string]: unknown };

// The wire shape (SerializedDrain). `status` is defaulted to 'enabled' by the
// server when unset, so treat it as effectively always present. `userId` is
// picked at runtime though absent from the declared type — optional here.
export interface Drain {
  id: string;
  name: string;
  createdAt: number; // unix ms
  updatedAt: number; // unix ms
  ownerId: string;
  userId?: string;
  teamId?: string | null;
  projectIds?: string[];
  status?: DrainStatus;
  firstErrorTimestamp?: number;
  disabledAt?: number;
  disabledBy?: string;
  disabledReason?: DrainDisabledReason;
  schemas: DrainSchemas;
  delivery: DrainDelivery;
  sampling?: DrainSampling;
  source: DrainSource;
  filterV2?: DrainFilter;
  // present only via ?includeMetadata=true (sideloaded on list):
  integrationIcon?: string;
  integrationConfigurationUri?: string;
  integrationWebsite?: string;
  projectAccess?: {
    access: 'all' | 'some';
    managedBy: 'drain' | 'integration';
    projectIds?: string[];
  };
}

export interface ListDrainsResponse {
  drains: Drain[];
}

// Delivery types accepted by POST /v1/drains, PATCH /v1/drains/:id, and
// POST /v1/drains/test. `clickhouse` and `internal` are not creatable via
// the public API.
export type DrainDeliveryInput =
  | DrainDeliveryHttp
  | DrainDeliveryOtlpHttp
  | DrainDeliveryS3;

export interface CreateDrainRequestBody {
  name: string;
  projects: 'all' | 'some';
  projectIds?: string[];
  schemas: DrainSchemas;
  delivery: DrainDeliveryInput;
  sampling?: DrainSampling;
}

// PATCH body: every field optional; only send what changed. `delivery` is a
// complete replacement object, not a partial merge, so callers must send the
// full delivery when changing any delivery field.
export interface UpdateDrainRequestBody {
  name?: string;
  projects?: 'all' | 'some';
  projectIds?: string[];
  schemas?: DrainSchemas;
  delivery?: DrainDeliveryInput;
  sampling?: DrainSampling;
  status?: 'enabled' | 'disabled';
}

export interface TestDrainRequestBody {
  schemas: DrainSchemas;
  delivery: DrainDeliveryInput;
}

// 200 response is `{}` on success, or `{status, error, endpoint}` when the
// sample delivery failed.
export interface TestDrainResponse {
  status?: string;
  error?: string;
  endpoint?: string;
}
