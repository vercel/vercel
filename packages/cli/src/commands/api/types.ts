import type { JSONObject } from '@vercel-internals/types';
import type { VercelCliTableDisplay } from '../../util/openapi/types';

// Re-export OpenAPI types for backwards compatibility
export type {
  OpenApiSpec,
  PathItem,
  Operation,
  Parameter,
  RequestBody,
  MediaType,
  Schema,
  Response,
  CachedSpec,
  EndpointInfo,
  BodyField,
} from '../../util/openapi';

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | JSONObject;
}

export interface ParsedFlags {
  '--help'?: boolean;
  '--describe'?: boolean;
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

/** Optional behavior for `executeApiRequest` (e.g. OpenAPI-driven table output). */
export interface ExecuteApiRequestOptions {
  vercelCliTable?: VercelCliTableDisplay | null;
}
