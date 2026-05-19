/**
 * Separate entry point for OpenAPI inferred commands (`--infer`).
 * Loaded via dynamic import from src/index.ts so the main CLI bundle stays lean.
 */
export { runInferredCommand } from './util/openapi/infer-commands';
export { inferredOpenApiCommands } from './util/openapi/inferred-commands-config';
