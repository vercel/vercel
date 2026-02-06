import type { JSONObject } from '@vercel-internals/types';

// Re-export OpenAPI types for backwards compatibility
export type {
  BodyField,
  CachedSpec,
  EndpointInfo,
  MediaType,
  OpenApiSpec,
  Operation,
  Parameter,
  PathItem,
  RequestBody,
  Response,
  Schema,
} from '../../util/openapi';

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | JSONObject;
}

export interface ParsedFlags {
  '--help'?: boolean;
  '--method'?: string;
  '--field'?: string[];
  '--raw-field'?: string[];
  '--header'?: string[];
  '--input'?: string;
  '--paginate'?: boolean;
  '--include'?: boolean;
  '--silent'?: boolean;
  '--verbose'?: boolean;
  '--raw'?: boolean;
  '--refresh'?: boolean;
  '--generate'?: string;
  '--format'?: string;
}

export interface SelectedEndpoint {
  path: string;
  method: string;
  finalUrl: string;
  bodyFields: string[];
}

export interface PromptResult {
  finalUrl: string;
  bodyFields: string[];
}
