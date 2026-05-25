import type Client from '../client';
import type { SrcSyntax } from './types';

export interface CurrentRouteInput {
  name: string;
  description?: string;
  pathCondition: { value: string; syntax: string };
  conditions?: Array<{
    field: string;
    operator: string;
    key?: string;
    value?: string;
    missing: boolean;
  }>;
  actions: Array<{
    type: string;
    subType?: string;
    dest?: string;
    status?: number;
    headers?: Array<{ key: string; value?: string; op: string }>;
  }>;
}

type GeneratedActionType = 'rewrite' | 'redirect' | 'set-status' | 'modify';
type GeneratedModifySubType =
  | 'response-headers'
  | 'transform-request-header'
  | 'transform-request-query';
type GeneratedConditionOperator = 'eq' | 'contains' | 're' | 'exists';
type GeneratedConditionField = 'header' | 'cookie' | 'query' | 'host';
type GeneratedHeaderOp = 'set' | 'append' | 'delete';

export interface GeneratedRoute {
  name: string;
  description: string;
  pathCondition: { value: string; syntax: SrcSyntax };
  conditions?: Array<{
    field: GeneratedConditionField;
    operator: GeneratedConditionOperator;
    key?: string;
    value?: string;
    missing: boolean;
  }>;
  actions: Array<{
    type: GeneratedActionType;
    subType?: GeneratedModifySubType;
    dest?: string;
    status?: number;
    headers?: Array<{ key: string; value?: string; op: GeneratedHeaderOp }>;
  }>;
}

export interface GenerateRouteResponse {
  route?: GeneratedRoute;
  error?: string;
}

export interface GenerateRouteInput {
  prompt: string;
  currentRoute?: CurrentRouteInput;
}

interface GenerateRouteOptions {
  teamId?: string;
}

export default async function generateRoute(
  client: Client,
  projectId: string,
  input: GenerateRouteInput,
  options: GenerateRouteOptions = {}
): Promise<GenerateRouteResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes/generate${queryString ? `?${queryString}` : ''}`;

  return await client.fetch<GenerateRouteResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}
