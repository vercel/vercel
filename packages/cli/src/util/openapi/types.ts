export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  servers?: Array<{ url: string; description?: string }>;
  components?: {
    schemas?: Record<string, Schema>;
  };
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
}

export interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Schema;
}

export interface RequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema;
}

export interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
  required?: string[];
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  format?: string;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
}

export interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

export interface CachedSpec {
  fetchedAt: number;
  spec: OpenApiSpec;
}

export interface EndpointInfo {
  path: string;
  method: string;
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
}

export interface BodyField {
  name: string;
  required: boolean;
  description?: string;
  type?: string;
  enumValues?: (string | number | boolean)[];
}
