import type Client from '../client';

const DEFAULT_AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh';

export type ModelPricing = {
  input?: string;
  output?: string;
};

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

export async function listModels(client: Client): Promise<Model[]> {
  // Public, unauthenticated, OpenAI-style endpoint. Passing an absolute URL to
  // client.fetch bypasses the default api host (new URL(url, apiUrl)).
  const { data } = await client.fetch<{ object: 'list'; data: Model[] }>(
    `${gatewayBase()}/v1/models`,
    { method: 'GET' }
  );
  return data ?? [];
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
