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

/**
 * `x-vercel-cli` on an **operation** (GET/POST/…). Distinct from schema-level `x-vercel-cli`.
 */
export interface VercelCliOperationExtension {
  /**
   * Opt this operation into `vercel api` / `vercel openapi` tag subcommands (list,
   * describe, invoke under `vercel api <tag> <operationId>`).
   */
  supportedSubcommands?: boolean;
  /**
   * Reserved for future top-level `vercel <command>` wiring (not nested under
   * `vercel api`). Ignored until implemented.
   */
  supportedProduction?: boolean;
  /**
   * @deprecated Prefer `supportedSubcommands`. When `true`, same as
   * `supportedSubcommands: true`.
   */
  supported?: boolean;
  /**
   * Alternate names for the second CLI argument (in addition to `operationId`), e.g.
   * `["list"]` so `vercel openapi projects list` works alongside `getProjects`.
   * Matched with the same folding rules as `operationId`.
   */
  aliases?: string[];
}

/**
 * `x-vercel-cli` on an OpenAPI **parameter** (path/query/header).
 */
export interface VercelCliParameterExtension {
  /**
   * How the parameter is exposed for `vercel openapi <tag> <operationId> ...`:
   * - **argument** — positional value after `<operationId>`, in `{pathTemplate}` order (default for `in: path`).
   * - **option** — `--kebab-param-name` (and `--name=value`), default for `in: query` / `in: header` / `in: cookie`.
   */
  kind?: 'argument' | 'option';
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
  'x-vercel-cli'?: VercelCliOperationExtension;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Schema;
  'x-vercel-cli'?: VercelCliParameterExtension;
}

export interface RequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema;
}

/**
 * CLI-only OpenAPI extension (`x-vercel-cli` on schemas). Ignored by standard OpenAPI tooling.
 */
/** Resolved `x-vercel-cli` layout for a successful JSON response. */
export interface VercelCliTableDisplay {
  /**
   * Top-level response property whose value is rendered:
   * - **Object** → key/value card (label | value).
   * - **Array** of objects → table with one row per element (and these column paths).
   */
  displayProperty: string;
  /** Column dot-paths for each row object (e.g. full AuthUser). */
  columnsDefault: string[];
  /** When a row has `limited: true`, use these columns (e.g. AuthUserLimited). */
  columnsWhenLimited?: string[];
}

export interface VercelCliSchemaExtension {
  /**
   * On a **response wrapper** object schema: name of the property to render. If its
   * schema is an object, the CLI uses a card layout; if an array of objects, a table.
   */
  displayProperty?: string;
  /**
   * On **AuthUser** (or similar) component schemas: dot-paths into the row object for
   * table columns (e.g. `["email", "softUser.blockedAt"]`).
   */
  displayColumns?: string[];
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
  'x-vercel-cli'?: VercelCliSchemaExtension;
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
  /** HTTP status code → response (for documentation / `--describe`) */
  responses?: Record<string, Response>;
  /**
   * True when the operation opts into `vercel api` tag mode (`x-vercel-cli.supportedSubcommands`,
   * or legacy `x-vercel-cli.supported`).
   */
  vercelCliSupported: boolean;
  /** `x-vercel-cli.aliases` from the OpenAPI document (trimmed, non-empty). */
  vercelCliAliases: string[];
}

export interface BodyField {
  name: string;
  required: boolean;
  description?: string;
  type?: string;
  enumValues?: (string | number | boolean)[];
}
