import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import getGlobalPathConfig from '../../util/config/global-path';
import output from '../../output-manager';
import { OPENAPI_URL, CACHE_FILE, CACHE_TTL_MS } from './constants';
import type {
  OpenApiSpec,
  CachedSpec,
  EndpointInfo,
  Schema,
  BodyField,
} from './types';

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
  private readonly cachePath: string;
  private spec: OpenApiSpec | null = null;

  constructor() {
    this.cachePath = join(getGlobalPathConfig(), CACHE_FILE);
  }

  /**
   * Check if the spec has been loaded
   */
  get isLoaded(): boolean {
    return this.spec !== null;
  }

  /**
   * Load the OpenAPI spec, using cache if available and fresh.
   * Returns true if successful, false otherwise.
   */
  async load(forceRefresh = false): Promise<boolean> {
    // Try to read from cache
    if (!forceRefresh) {
      const cached = await this.readCache();
      if (cached && !this.isExpired(cached.fetchedAt)) {
        output.debug('Using cached OpenAPI spec');
        this.spec = cached.spec;
        return true;
      }
    }

    // Fetch fresh spec
    try {
      output.debug('Fetching OpenAPI spec from ' + OPENAPI_URL);
      this.spec = await this.fetchSpec();
      await this.saveCache(this.spec);
      return true;
    } catch (err) {
      output.debug(`Failed to fetch OpenAPI spec: ${err}`);
      // If fetch fails, try to use stale cache
      const stale = await this.readCache();
      if (stale) {
        output.debug('Using stale cached OpenAPI spec');
        this.spec = stale.spec;
        return true;
      }
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

    for (const [name, propSchema] of Object.entries(schema.properties)) {
      const resolvedProp = this.resolveSchemaRef(propSchema);

      fields.push({
        name,
        required: requiredFields.has(name),
        description: resolvedProp?.description || propSchema.description,
        type: resolvedProp?.type || propSchema.type,
        enumValues: resolvedProp?.enum || propSchema.enum,
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
  private ensureLoaded(): asserts this is this & { spec: OpenApiSpec } {
    if (!this.spec) {
      throw new Error(
        'OpenAPI spec not loaded. Call load() or loadWithSpinner() first.'
      );
    }
  }

  /**
   * Read cached spec from disk
   */
  private async readCache(): Promise<CachedSpec | null> {
    try {
      const content = await readFile(this.cachePath, 'utf-8');
      return JSON.parse(content) as CachedSpec;
    } catch {
      return null;
    }
  }

  /**
   * Save spec to disk cache
   */
  private async saveCache(spec: OpenApiSpec): Promise<void> {
    const cached: CachedSpec = {
      fetchedAt: Date.now(),
      spec,
    };

    // Ensure directory exists
    const dir = join(this.cachePath, '..');
    await mkdir(dir, { recursive: true });

    await writeFile(this.cachePath, JSON.stringify(cached));
    output.debug('Saved OpenAPI spec to cache');
  }

  /**
   * Fetch OpenAPI spec from remote
   */
  private async fetchSpec(): Promise<OpenApiSpec> {
    const response = await fetch(OPENAPI_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status}`);
    }
    return (await response.json()) as OpenApiSpec;
  }

  /**
   * Check if cached spec is expired
   */
  private isExpired(fetchedAt: number): boolean {
    return Date.now() - fetchedAt > CACHE_TTL_MS;
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
