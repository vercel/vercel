import type Client from '../client';

const DEFAULT_AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh';

export type ModelPricing = {
  input?: string;
  output?: string;
};

export type AvailabilityUnknownReason =
  | 'billing_state_unresolved'
  | 'plan_policy_unresolved'
  | 'quota_binding_unresolved'
  | 'rate_limit_policy_unresolved'
  | 'realtime_policy_unresolved'
  | 'request_context_unresolved'
  | 'scope_budget_policy_unresolved';

export type Model = {
  id: string;
  object: 'model';
  created?: number;
  released?: number;
  owned_by: string;
  name: string;
  description?: string;
  context_window?: number;
  max_tokens?: number;
  type?: string;
  tags?: string[];
  pricing?: ModelPricing;
  // Per-team availability, returned when this client explicitly opts in via
  // `include_availability`. `available` is effective: the account-wide gate
  // (card, credits, quota) composed with the team's routing policy for this
  // model. The `account_unavailable` reason marks exactly the policy-admitted
  // models an account blocker is holding back — they become runnable once it
  // clears. An unknown reason is neutral and must not be interpreted as
  // routable.
  available?: boolean;
  availability_unknown_reason?: AvailabilityUnknownReason;
  unavailable_reason?: string;
};

export type ModelsListResult = {
  models: Model[];
  availabilityStatus?: 'complete' | 'partial';
  accountAvailability?: AccountAvailability;
  catalogStatus?: 'complete' | 'partial';
};

export type AccountAvailability =
  | {
      available: boolean;
      applies_to?: 'http';
      unavailable_reason?:
        | 'insufficient_funds'
        | 'payment_method_required'
        | 'quota_exceeded'
        | 'quota_invalid'
        | 'team_blocked';
    }
  | {
      applies_to?: 'http';
      availability_unknown_reason: AvailabilityUnknownReason;
    };

export type ModelEndpointPricing = {
  prompt?: string;
  completion?: string;
  request?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  // Non-token pricing (image/video/audio/per-request models)
  image?: string;
  image_output?: string;
  speech_input_character_cost?: string;
  video_duration_pricing?: { resolution?: string; cost_per_second?: string }[];
};

export type ModelEndpoint = {
  name: string;
  model_name?: string;
  provider_name: string;
  context_length?: number;
  max_completion_tokens?: number;
  pricing?: ModelEndpointPricing;
  tags?: string[];
  uptime_last_1h?: number;
  latency_last_1h?: { p50?: number; p95?: number };
  throughput_last_1h?: { p50?: number; p95?: number };
};

export type ModelWithEndpoints = {
  id: string;
  name: string;
  description?: string;
  endpoints: ModelEndpoint[];
};

function gatewayBase(): string {
  return process.env.VERCEL_AI_GATEWAY_URL ?? DEFAULT_AI_GATEWAY_URL;
}

type ModelsListResponse = {
  account_availability?: AccountAvailability;
  availability_status?: 'complete' | 'partial';
  catalog_status?: 'complete' | 'partial';
  data: Model[];
  object: 'list';
};

function isModel(value: unknown): value is Model {
  if (typeof value !== 'object' || value === null) return false;
  const model = value as Partial<Model>;
  return (
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    model.object === 'model' &&
    typeof model.owned_by === 'string'
  );
}

function isModelsListResponse(value: unknown): value is ModelsListResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<ModelsListResponse>;
  return (
    response.object === 'list' &&
    Array.isArray(response.data) &&
    response.data.every(isModel)
  );
}

export async function listModels(client: Client): Promise<ModelsListResult> {
  // OpenAI-style model catalog. The absolute URL bypasses the default api host,
  // but client.fetch still attaches the auth token and `?teamId=<currentTeam>`,
  // while `include_availability` explicitly opts this CLI into the Gateway's
  // team-specific availability extension without changing the default response
  // consumed by OpenAI-compatible harnesses.
  const response = await client.fetch<unknown>(
    `${gatewayBase()}/v1/models?include_availability`,
    { method: 'GET' }
  );
  if (!isModelsListResponse(response)) {
    throw new Error('AI Gateway returned an invalid model catalog response.');
  }
  const {
    account_availability: accountAvailability,
    availability_status: availabilityStatus,
    catalog_status: catalogStatus,
    data: models,
  } = response;
  return {
    accountAvailability,
    availabilityStatus,
    catalogStatus,
    models,
  };
}

export async function listModelEndpoints(
  client: Client,
  model: string
): Promise<ModelWithEndpoints> {
  // Model ids contain a slash (e.g. anthropic/claude-opus-4.8); keep it as a
  // path, only encoding each segment.
  const path = model.split('/').map(encodeURIComponent).join('/');
  const { data } = await client.fetch<{ data: ModelWithEndpoints }>(
    `${gatewayBase()}/v1/models/${path}/endpoints`,
    { method: 'GET' }
  );
  return data;
}
