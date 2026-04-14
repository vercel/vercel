import { readFile } from 'fs/promises';
import output from '../../output-manager';
import { resolveOpenApiSpecPathForCli } from './resolve-openapi-spec-path';
import type {
  OpenApiSpec,
  EndpointInfo,
  Operation,
  Schema,
  BodyField,
  VercelCliTableDisplay,
} from './types';
import { foldNamingStyle } from './fold-naming-style';
import { VERCEL_CLI_ROOT_DISPLAY_KEY } from './constants';

/**
 * Manages OpenAPI spec fetching, caching, and parsing.
 *
 * Usage:
 * ```typescript
 * const cache = new OpenApiCache();
 * await cache.load();
 * const endpoints = cache.getEndpoints();
 * const bodyFields = cache.getBodyFields(endpoint);
 * ```
 */
export class OpenApiCache {
  private spec: OpenApiSpec | null = null;

  /**
   * Check if the spec has been loaded
   */
  get isLoaded(): boolean {
    return this.spec !== null;
  }

  /**
   * Load the OpenAPI spec from disk (never from openapi.vercel.sh).
   * Resolution order: `VERCEL_OPENAPI_SPEC_PATH`, `openapi.json` walking
   * up from `process.cwd()`, then repo-root `openapi.json` next to this package.
   * `forceRefresh` is kept for API compatibility and always re-reads the file.
   */
  async load(forceRefresh = false): Promise<boolean> {
    void forceRefresh;
    const resolvedPath = resolveOpenApiSpecPathForCli();
    if (!resolvedPath) {
      output.debug(
        'No openapi.json found. Set VERCEL_OPENAPI_SPEC_PATH or run from a checkout whose root contains openapi.json.'
      );
      return false;
    }
    try {
      output.debug(`Loading OpenAPI spec from ${resolvedPath}`);
      const raw = await readFile(resolvedPath, 'utf-8');
      this.spec = JSON.parse(raw) as OpenApiSpec;
      return true;
    } catch (err) {
      output.debug(`Failed to load OpenAPI spec: ${err}`);
      return false;
    }
  }

  /**
   * Load the OpenAPI spec with spinner UI.
   * Returns true if successful, false otherwise.
   */
  async loadWithSpinner(forceRefresh = false): Promise<boolean> {
    output.spinner(
      forceRefresh ? 'Refreshing API endpoints...' : 'Loading API endpoints...'
    );
    const success = await this.load(forceRefresh);
    output.stopSpinner();
    return success;
  }

  /**
   * Get all available endpoints from the loaded spec, sorted by path then method.
   * Throws if spec hasn't been loaded yet.
   */
  getEndpoints(): EndpointInfo[] {
    this.ensureLoaded();
    const endpoints = this.extractEndpoints();
    return this.sortEndpoints(endpoints);
  }

  /**
   * Endpoints with `x-vercel-cli.supported: true` on the operation (for `vercel openapi`).
   */
  getCliSupportedEndpoints(): EndpointInfo[] {
    return this.getEndpoints().filter(ep => ep.vercelCliSupported);
  }

  /**
   * Whether `requested` matches a tag on the operation (case-insensitive; camel /
   * kebab / snake folds match, e.g. `access-groups` and `accessGroups`).
   */
  private tagsInclude(
    epTags: string[] | undefined,
    requested: string
  ): boolean {
    if (!epTags?.length) {
      return false;
    }
    const want = foldNamingStyle(requested);
    return epTags.some(t => foldNamingStyle(t) === want);
  }

  /** `operationId` or any `x-vercel-cli.aliases` entry (same fold as tag matching). */
  private operationIdOrAliasMatches(
    ep: EndpointInfo,
    requestedFold: string
  ): boolean {
    if (foldNamingStyle(ep.operationId) === requestedFold) {
      return true;
    }
    for (const a of ep.vercelCliAliases) {
      if (foldNamingStyle(a) === requestedFold) {
        return true;
      }
    }
    return false;
  }

  private cliSortName(ep: EndpointInfo): string {
    return ep.vercelCliAliases[0] ?? ep.operationId ?? '';
  }

  /**
   * Resolve tag + operationId (including unsupported operations).
   * `operationId` may be an `x-vercel-cli` alias (e.g. `list` for `getProjects`).
   */
  findEndpointByTagAndOperationId(
    tag: string,
    operationId: string
  ): EndpointInfo | undefined {
    const opFold = foldNamingStyle(operationId);
    for (const ep of this.getEndpoints()) {
      if (!this.operationIdOrAliasMatches(ep, opFold)) {
        continue;
      }
      if (this.tagsInclude(ep.tags, tag)) {
        return ep;
      }
    }
    return undefined;
  }

  /**
   * Find an operation by tag and `operationId` that is opted into `vercel openapi`
   * (`x-vercel-cli.supported: true`).
   */
  findByTagAndOperationId(
    tag: string,
    operationId: string
  ): EndpointInfo | undefined {
    const ep = this.findEndpointByTagAndOperationId(tag, operationId);
    if (ep?.vercelCliSupported) {
      return ep;
    }
    return undefined;
  }

  /**
   * Distinct tag names from the loaded spec (for suggestions when lookup fails).
   */
  getAllTags(): string[] {
    const found = new Set<string>();
    for (const ep of this.getEndpoints()) {
      for (const t of ep.tags || []) {
        found.add(t);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Tags that have at least one `vercel openapi`-supported operation.
   */
  getAllCliTags(): string[] {
    const found = new Set<string>();
    for (const ep of this.getCliSupportedEndpoints()) {
      for (const t of ep.tags || []) {
        found.add(t);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }

  /**
   * All operations that list `tag` in `tags`, sorted by operationId then path.
   * Matching is case-insensitive and treats camel / kebab / snake as equivalent.
   * Only operations with `x-vercel-cli.supported: true` are included (for `vercel openapi`).
   */
  findEndpointsByTag(tag: string): EndpointInfo[] {
    const list = this.getCliSupportedEndpoints().filter(ep =>
      this.tagsInclude(ep.tags, tag)
    );
    return list.sort((a, b) => {
      const nameA = this.cliSortName(a);
      const nameB = this.cliSortName(b);
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) {
        return cmp;
      }
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) {
        return pathCmp;
      }
      return a.method.localeCompare(b.method);
    });
  }

  /**
   * All tags that declare this `operationId` (operations may appear under multiple tags).
   * `operationId` matches case-insensitively and across camel / kebab / snake.
   */
  findTagsForOperationId(operationId: string): string[] {
    const want = foldNamingStyle(operationId);
    const found = new Set<string>();
    for (const ep of this.getEndpoints()) {
      if (!this.operationIdOrAliasMatches(ep, want)) {
        continue;
      }
      for (const t of ep.tags || []) {
        found.add(t);
      }
    }
    return [...found].sort();
  }

  /**
   * Like {@link findTagsForOperationId} but only for `vercel openapi`-supported operations.
   */
  findTagsForCliSupportedOperationId(operationId: string): string[] {
    const want = foldNamingStyle(operationId);
    const found = new Set<string>();
    for (const ep of this.getCliSupportedEndpoints()) {
      if (!this.operationIdOrAliasMatches(ep, want)) {
        continue;
      }
      for (const t of ep.tags || []) {
        found.add(t);
      }
    }
    return [...found].sort();
  }

  /**
   * Resolve `$ref` and shallow `allOf` merge for schema display (same rules as request body).
   */
  resolveSchemaForDisplay(schema: Schema | undefined): Schema | undefined {
    return this.resolveSchemaRef(schema);
  }

  /**
   * Resolved CLI table layout plus schemas used to derive per-column types for `--describe`.
   */
  private resolveVercelCliTableLayout(endpoint: EndpointInfo): {
    display: VercelCliTableDisplay;
    typeSchemaDefault: Schema | undefined;
    typeSchemaLimited?: Schema | undefined;
  } | null {
    this.ensureLoaded();
    const schema = this.pickSuccessJsonBodySchema(endpoint.responses);
    if (!schema) {
      return null;
    }
    const outer = this.unwrapJsonResponseSchema(schema);
    if (!outer?.properties) {
      return null;
    }
    const displayProperty =
      outer['x-vercel-cli']?.displayProperty ??
      this.inferPaginatedListDisplayProperty(outer) ??
      this.inferWrapperDisplayProperty(outer);

    if (!displayProperty && this.inferFlatRootEntity(outer)) {
      const direct = this.resolveSchemaRef(outer);
      let cols = direct?.['x-vercel-cli']?.displayColumns;
      if (!cols?.length) {
        cols = this.inferColumnsFromBranchSchema(direct, false);
      }
      if (!cols?.length) {
        return null;
      }
      return {
        display: {
          displayProperty: VERCEL_CLI_ROOT_DISPLAY_KEY,
          columnsDefault: cols,
        },
        typeSchemaDefault: direct,
      };
    }

    if (!displayProperty || !outer.properties[displayProperty]) {
      return null;
    }
    const innerRaw = outer.properties[displayProperty];
    const inner = this.resolveSchemaRef(innerRaw);

    if (inner?.type === 'array') {
      const item = this.resolveSchemaRef(inner.items);
      let cols = item?.['x-vercel-cli']?.displayColumns;
      if (!cols?.length) {
        cols = this.inferColumnsFromBranchSchema(item, false);
      }
      if (!cols?.length) {
        return null;
      }
      return {
        display: { displayProperty, columnsDefault: cols },
        typeSchemaDefault: item,
      };
    }

    if (inner?.oneOf?.length) {
      let columnsDefault: string[] = [];
      let columnsWhenLimited: string[] | undefined;
      let typeSchemaDefault: Schema | undefined;
      let typeSchemaLimited: Schema | undefined;
      for (const branch of inner.oneOf) {
        const resolved = this.resolveSchemaRef(branch);
        const ref = branch.$ref || '';
        const isLimited = Boolean(
          ref.includes('Limited') ||
            (resolved?.properties &&
              Object.prototype.hasOwnProperty.call(
                resolved.properties,
                'limited'
              ))
        );
        let cols = resolved?.['x-vercel-cli']?.displayColumns;
        if (!cols?.length) {
          cols = this.inferColumnsFromBranchSchema(resolved, isLimited);
        }
        if (!cols?.length) {
          continue;
        }
        if (isLimited) {
          columnsWhenLimited = cols;
          typeSchemaLimited = resolved;
        } else {
          columnsDefault = cols;
          typeSchemaDefault = resolved;
        }
      }
      if (!columnsDefault.length && inner.oneOf.length > 0) {
        const firstBranch = inner.oneOf[0];
        const first = this.resolveSchemaRef(firstBranch);
        const isLimited = Boolean(
          (firstBranch.$ref || '').includes('Limited') ||
            (first?.properties &&
              Object.prototype.hasOwnProperty.call(first.properties, 'limited'))
        );
        columnsDefault =
          first?.['x-vercel-cli']?.displayColumns ??
          this.inferColumnsFromBranchSchema(first, isLimited);
        typeSchemaDefault = first;
      }
      if (!columnsDefault.length) {
        return null;
      }
      const display: VercelCliTableDisplay = {
        displayProperty,
        columnsDefault,
        ...(columnsWhenLimited?.length ? { columnsWhenLimited } : {}),
      };
      return {
        display,
        typeSchemaDefault,
        ...(columnsWhenLimited?.length && typeSchemaLimited
          ? { typeSchemaLimited }
          : {}),
      };
    }

    const direct = inner ? this.resolveSchemaRef(inner) : undefined;
    let cols = direct?.['x-vercel-cli']?.displayColumns;
    if (!cols?.length) {
      cols = this.inferColumnsFromBranchSchema(direct, false);
    }
    if (!cols?.length) {
      return null;
    }
    return {
      display: { displayProperty, columnsDefault: cols },
      typeSchemaDefault: direct,
    };
  }

  /**
   * Resolve `x-vercel-cli` table layout for a successful `application/json` response, if defined.
   */
  getVercelCliTableDisplay(
    endpoint: EndpointInfo
  ): VercelCliTableDisplay | null {
    return this.resolveVercelCliTableLayout(endpoint)?.display ?? null;
  }

  /**
   * Column paths and OpenAPI-style type strings for `vercel openapi <tag> <op> --describe`,
   * mirroring the CLI card / table column layout (second column is type, not a response value).
   */
  describeResponseCliColumns(endpoint: EndpointInfo): {
    displayProperty: string;
    defaultColumns: Array<{ path: string; type: string }>;
    limitedColumns?: Array<{ path: string; type: string }>;
  } | null {
    const layout = this.resolveVercelCliTableLayout(endpoint);
    if (!layout) {
      return null;
    }
    const { display, typeSchemaDefault, typeSchemaLimited } = layout;
    const defaultColumns = display.columnsDefault.map(path => ({
      path,
      type: this.schemaTypeStringAtPath(typeSchemaDefault, path),
    }));
    let limitedColumns: Array<{ path: string; type: string }> | undefined;
    if (
      display.columnsWhenLimited?.length &&
      typeSchemaLimited &&
      display.columnsWhenLimited.length > 0
    ) {
      limitedColumns = display.columnsWhenLimited.map(path => ({
        path,
        type: this.schemaTypeStringAtPath(typeSchemaLimited, path),
      }));
    }
    return {
      displayProperty: display.displayProperty,
      defaultColumns,
      ...(limitedColumns?.length ? { limitedColumns } : {}),
    };
  }

  /**
   * Type string for a leaf schema (used in `--describe` column tables).
   */
  private formatSchemaAsTypeString(schema: Schema | undefined): string {
    if (!schema) {
      return 'unknown';
    }
    const resolved = this.resolveSchemaRef(schema);
    if (!resolved) {
      return 'unknown';
    }
    if (resolved.$ref) {
      const match = resolved.$ref.match(/^#\/components\/schemas\/(.+)$/);
      return match ? match[1] : 'object';
    }
    if (resolved.enum?.length && !resolved.properties) {
      const raw = resolved.enum.map(v => JSON.stringify(v)).join(' | ');
      return raw.length <= 48 ? raw : `${resolved.type ?? 'string'}`;
    }
    if (resolved.type === 'array') {
      const it = this.resolveSchemaRef(resolved.items);
      return `Array<${this.formatSchemaAsTypeString(it)}>`;
    }
    if (resolved.oneOf?.length) {
      return resolved.oneOf
        .map(s => this.formatSchemaAsTypeString(s))
        .join(' | ');
    }
    if (resolved.anyOf?.length) {
      return resolved.anyOf
        .map(s => this.formatSchemaAsTypeString(s))
        .join(' | ');
    }
    const nullable = Boolean(
      (resolved as Schema & { nullable?: boolean }).nullable
    );
    const base = resolved.type ?? (resolved.properties ? 'object' : 'unknown');
    const nullSuffix = nullable ? ' | null' : '';
    if (base === 'object' && resolved.properties) {
      return `object${nullSuffix}`;
    }
    return `${base}${nullSuffix}`;
  }

  /**
   * Type of the property at `dotPath` on an object schema (e.g. `softBlock.blockedAt`).
   */
  private schemaTypeStringAtPath(
    root: Schema | undefined,
    dotPath: string
  ): string {
    if (!root || !dotPath) {
      return 'unknown';
    }
    const segments = dotPath.split('.').filter(Boolean);
    let cur: Schema | undefined = this.resolveSchemaRef(root);
    for (let i = 0; i < segments.length; i++) {
      if (!cur) {
        return 'unknown';
      }
      const seg = segments[i]!;
      if (i === segments.length - 1) {
        const prop = cur.properties?.[seg];
        return this.formatSchemaAsTypeString(prop);
      }
      const next = cur.properties?.[seg];
      cur = this.resolveSchemaRef(next);
    }
    return 'unknown';
  }

  /**
   * Success bodies often use `oneOf` (e.g. raw array vs `{ projects, pagination }`).
   * Pick an object branch with `projects` + `pagination` when present, else the first
   * branch that defines `properties`.
   */
  private unwrapJsonResponseSchema(
    schema: Schema | undefined
  ): Schema | undefined {
    let s = this.resolveSchemaRef(schema);
    for (let i = 0; i < 8 && s; i++) {
      if (s.properties && !s.oneOf && !s.anyOf) {
        return s;
      }
      const branches = s.oneOf ?? s.anyOf;
      if (!branches?.length) {
        return s;
      }
      let picked: Schema | undefined;
      for (const b of branches) {
        const r = this.resolveSchemaRef(b);
        if (!r?.properties) {
          continue;
        }
        const p = r.properties;
        const paginatedEnvelope =
          p.pagination &&
          (p.projects ||
            p.deployments ||
            p.domains ||
            p.teams ||
            p.aliases ||
            p.tokens ||
            p.accessGroups);
        const eventsOnly =
          p.events &&
          this.resolveSchemaRef(p.events as Schema)?.type === 'array';
        if (paginatedEnvelope || eventsOnly) {
          picked = r;
          break;
        }
      }
      if (!picked) {
        for (const b of branches) {
          const r = this.resolveSchemaRef(b);
          if (r?.properties) {
            picked = r;
            break;
          }
        }
      }
      if (!picked) {
        picked = this.resolveSchemaRef(branches[0]);
      }
      s = picked;
    }
    return s;
  }

  /**
   * Paginated list envelopes: `{ <itemsKey>: [...], pagination }` (e.g. projects, deployments, teams).
   */
  private inferPaginatedListDisplayProperty(outer: Schema): string | undefined {
    const keys = [
      'projects',
      'deployments',
      'domains',
      'teams',
      'aliases',
      'tokens',
      'accessGroups',
      'events',
    ] as const;
    for (const key of keys) {
      const p = outer.properties?.[key];
      const arr = this.resolveSchemaRef(p);
      if (arr?.type === 'array') {
        return key;
      }
    }
    return undefined;
  }

  /**
   * Top-level object responses with no wrapper property (project, team, deployment, …).
   */
  private inferFlatRootEntity(outer: Schema): boolean {
    if (this.inferPaginatedListDisplayProperty(outer)) {
      return false;
    }
    if (this.inferWrapperDisplayProperty(outer)) {
      return false;
    }
    if (outer.properties?.pagination) {
      return false;
    }
    const direct = this.resolveSchemaRef(outer);
    const cols = this.inferColumnsFromBranchSchema(direct, false);
    return cols.length >= 2;
  }

  /**
   * When the published spec omits `x-vercel-cli.displayProperty`, infer it from a
   * `{ singleKey: { oneOf: [...] } }` wrapper (e.g. `{ user: AuthUser | AuthUserLimited }`).
   */
  private inferWrapperDisplayProperty(outer: Schema): string | undefined {
    if (!outer.properties) {
      return undefined;
    }
    const keys = Object.keys(outer.properties);
    if (keys.length !== 1) {
      return undefined;
    }
    const only = keys[0];
    const inner = this.resolveSchemaRef(outer.properties[only]);
    if (inner?.oneOf && inner.oneOf.length >= 2) {
      return only;
    }
    return undefined;
  }

  /**
   * Infer table columns when component schemas omit `x-vercel-cli.displayColumns`
   * (e.g. openapi.vercel.sh does not ship CLI extensions).
   */
  private inferColumnsFromBranchSchema(
    resolved: Schema | undefined,
    limitedBranch: boolean
  ): string[] {
    if (!resolved?.properties) {
      return [];
    }
    const props = resolved.properties;
    const preferredLimited = [
      'limited',
      'id',
      'email',
      'name',
      'username',
      'defaultTeamId',
      'avatar',
    ];
    const preferredFull = [
      'id',
      'uid',
      'accessGroupId',
      'slug',
      'name',
      'text',
      'alias',
      'url',
      'accountId',
      'email',
      'username',
      'framework',
      'readyState',
      'state',
      'source',
      'type',
      'projectId',
      'teamId',
      'verified',
      'serviceType',
      'created',
      'createdAt',
      'updatedAt',
      'version',
      'avatar',
    ];
    const preferred = limitedBranch ? preferredLimited : preferredFull;
    const cols: string[] = [];
    for (const key of preferred) {
      if (!props[key]) {
        continue;
      }
      const pr = this.resolveSchemaRef(props[key]);
      if (this.isScalarishPropertySchema(pr)) {
        cols.push(key);
      }
    }
    if (!limitedBranch) {
      const sb = props.softBlock;
      if (sb) {
        const sbr = this.resolveSchemaRef(sb);
        if (sbr?.properties?.blockedAt) {
          cols.push('softBlock.blockedAt');
        }
        if (sbr?.properties?.reason) {
          cols.push('softBlock.reason');
        }
      }
    }
    return cols.slice(0, 14);
  }

  private isScalarishPropertySchema(s: Schema | undefined): boolean {
    if (!s) {
      return false;
    }
    const t = s.type;
    if (
      t === 'string' ||
      t === 'number' ||
      t === 'integer' ||
      t === 'boolean'
    ) {
      return true;
    }
    if (s.enum && !s.properties) {
      return true;
    }
    return false;
  }

  private pickSuccessJsonBodySchema(
    responses: EndpointInfo['responses']
  ): Schema | undefined {
    if (!responses) {
      return undefined;
    }
    for (const code of ['200', '201', '202'] as const) {
      const r = responses[code];
      const s = r?.content?.['application/json']?.schema;
      if (s) {
        return s;
      }
    }
    return undefined;
  }

  /**
   * Extract body fields from a requestBody schema.
   * Throws if spec hasn't been loaded yet.
   */
  getBodyFields(endpoint: EndpointInfo): BodyField[] {
    this.ensureLoaded();

    if (!endpoint.requestBody?.content) return [];

    // Get the JSON content schema
    const jsonContent = endpoint.requestBody.content['application/json'];
    if (!jsonContent?.schema) return [];

    const schema = this.resolveSchemaRef(jsonContent.schema);
    if (!schema?.properties) return [];

    const requiredFields = new Set(schema.required || []);
    const fields: BodyField[] = [];

    for (const [name, propSchema] of Object.entries(schema.properties) as [
      string,
      Schema,
    ][]) {
      const resolvedProp = this.resolveSchemaRef(propSchema);

      // Get enum values from the schema, handling array items
      let enumValues = resolvedProp?.enum || propSchema.enum;
      if (
        !enumValues &&
        (resolvedProp?.type === 'array' || propSchema.type === 'array')
      ) {
        const items = resolvedProp?.items || propSchema.items;
        if (items) {
          const resolvedItems = this.resolveSchemaRef(items);
          enumValues = resolvedItems?.enum || items.enum;
        }
      }

      fields.push({
        name,
        required: requiredFields.has(name),
        description: resolvedProp?.description || propSchema.description,
        type: resolvedProp?.type || propSchema.type,
        enumValues,
      });
    }

    // Sort by required first, then alphabetically
    fields.sort((a, b) => {
      if (a.required !== b.required) {
        return a.required ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return fields;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Ensure the spec is loaded before accessing it
   */
  private ensureLoaded(): void {
    if (!this.spec) {
      throw new Error(
        'OpenAPI spec not loaded. Call load() or loadWithSpinner() first.'
      );
    }
  }

  private isVercelCliOperationSupported(operation: Operation): boolean {
    return operation['x-vercel-cli']?.supported === true;
  }

  private normalizeVercelCliAliases(operation: Operation): string[] {
    const raw = operation['x-vercel-cli']?.aliases;
    if (raw == null) {
      return [];
    }
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map(a => String(a).trim()).filter(Boolean);
  }

  /**
   * Sort endpoints by path, then by method
   */
  private sortEndpoints(endpoints: EndpointInfo[]): EndpointInfo[] {
    return endpoints.sort((a, b) => {
      const pathCompare = a.path.localeCompare(b.path);
      if (pathCompare !== 0) return pathCompare;
      return a.method.localeCompare(b.method);
    });
  }

  /**
   * Extract all available endpoints from the spec
   */
  private extractEndpoints(): EndpointInfo[] {
    const endpoints: EndpointInfo[] = [];

    for (const [path, pathItem] of Object.entries(this.spec!.paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

      for (const method of methods) {
        const operation = pathItem[method];
        if (operation) {
          // Merge path-level and operation-level parameters
          const pathParams = pathItem.parameters || [];
          const opParams = operation.parameters || [];
          const allParams = [...pathParams, ...opParams];

          endpoints.push({
            path,
            method: method.toUpperCase(),
            summary: operation.summary || pathItem.summary || '',
            description: operation.description || pathItem.description || '',
            operationId: operation.operationId || '',
            tags: operation.tags || [],
            parameters: allParams,
            requestBody: operation.requestBody,
            responses: operation.responses,
            vercelCliSupported: this.isVercelCliOperationSupported(operation),
            vercelCliAliases: this.normalizeVercelCliAliases(operation),
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Resolve a $ref to its actual schema
   */
  private resolveSchemaRef(schema: Schema | undefined): Schema | undefined {
    if (!schema) return undefined;

    if (schema.$ref) {
      // Parse $ref like "#/components/schemas/SchemaName"
      const match = schema.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match && this.spec!.components?.schemas) {
        const resolved = this.spec!.components.schemas[match[1]];
        // Recursively resolve if the resolved schema also has a $ref
        return this.resolveSchemaRef(resolved);
      }
      return undefined;
    }

    // Handle allOf by merging schemas
    if (schema.allOf && schema.allOf.length > 0) {
      const merged: Schema = { type: 'object', properties: {}, required: [] };
      for (const subSchema of schema.allOf) {
        const resolved = this.resolveSchemaRef(subSchema);
        if (resolved) {
          if (resolved.properties) {
            merged.properties = {
              ...merged.properties,
              ...resolved.properties,
            };
          }
          if (resolved.required) {
            merged.required = [
              ...(merged.required || []),
              ...resolved.required,
            ];
          }
        }
      }
      return merged;
    }

    return schema;
  }
}
