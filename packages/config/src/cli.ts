#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { validateStaticFields } from './utils/validation';

/**
 * Named exports that should NOT be auto-converted to config
 * (these are route-based features that compile into the routes array, or internal module properties)
 */
const ROUTE_BASED_EXPORTS = new Set([
  'default',
  'routes',
  'redirects',
  'rewrites',
  'headers',
  'env',
  'cacheControl',
  '__esModule',
]);

/**
 * Check if an item is a Route (uses src/dest) vs a Rewrite/Redirect (uses source/destination)
 * This feels kinda brittle but at this point we don't have the actual schemas available as types
 * so I think it's the best we can do. We should definitely remove all these anys though
 */
function isRouteFormat(item: any): boolean {
  return item && typeof item === 'object' && 'src' in item;
}

/**
 * Convert a Rewrite or Redirect to Route format
 */
function toRouteFormat(item: any, isRedirect: boolean): any {
  const route: any = {
    src: item.source,
    dest: item.destination,
  };
  if (item.has) route.has = item.has;
  if (item.missing) route.missing = item.missing;

  if (isRedirect) {
    route.redirect = true;
    route.status = item.statusCode || (item.permanent ? 308 : 307);
  } else {
    if (item.respectOriginCacheControl !== undefined) {
      route.respectOriginCacheControl = item.respectOriginCacheControl;
    }
  }

  return route;
}

/**
 * Normalize an array field (rewrites or redirects) if it contains mixed formats.
 * Returns the converted routes if normalization occurred, or null if no changes needed.
 */
function normalizeArrayField(
  items: any[] | undefined,
  isRedirect: boolean
): any[] | null {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  const hasRouteFormat = items.some(isRouteFormat);
  if (!hasRouteFormat) {
    return null;
  }

  return items.map(item =>
    isRouteFormat(item) ? item : toRouteFormat(item, isRedirect)
  );
}

/**
 * Normalize config to ensure valid vercel.json output.
 *
 * Handles mixed Route/Rewrite types in the same array (from routes.rewrite() API).
 * When Route format items (src/dest) are detected in rewrites/redirects arrays,
 * the entire array is normalized to routes format.
 *
 * If routes and rewrites/redirects are BOTH explicitly defined,
 * returns unchanged to let schema validation fail.
 */
export function normalizeConfig(config: any): any {
  const normalized = { ...config };
  let allRoutes: any[] = normalized.routes || [];

  const hasRoutes = allRoutes.length > 0;
  const hasRewrites = normalized.rewrites?.length > 0;
  const hasRedirects = normalized.redirects?.length > 0;

  // If routes explicitly exists alongside rewrites/redirects, don't merge - let schema validation fail
  if (hasRoutes && (hasRewrites || hasRedirects)) {
    return normalized;
  }

  const convertedRewrites = normalizeArrayField(normalized.rewrites, false);
  const convertedRedirects = normalizeArrayField(normalized.redirects, true);

  if (convertedRewrites) {
    allRoutes = [...allRoutes, ...convertedRewrites];
    delete normalized.rewrites;
  }

  if (convertedRedirects) {
    allRoutes = [...allRoutes, ...convertedRedirects];
    delete normalized.redirects;
  }

  if (allRoutes.length > 0) {
    normalized.routes = allRoutes;
  }

  return normalized;
}

/**
 * Read the user's vercel.ts file and collect both default export and export const declarations
 */
async function configureRouter() {
  const vercelTsPath = resolve(process.cwd(), 'vercel.ts');
  const routerConfigPath = resolve(process.cwd(), 'router.config.ts');

  // Prefer vercel.ts, fallback to router.config.ts
  const configPath = existsSync(vercelTsPath) ? vercelTsPath : routerConfigPath;

  // Import the entire module to get both default and named exports
  const module = await import(configPath);

  // Start with the default export (router.getConfig())
  const routerConfig = module.default || {};

  // Auto-collect all export const declarations (except route-based ones)
  const exportedConstants: Record<string, any> = {};
  for (const [key, value] of Object.entries(module)) {
    if (!ROUTE_BASED_EXPORTS.has(key)) {
      exportedConstants[key] = value;
    }
  }

  const config = {
    ...routerConfig,
    ...exportedConstants,
  };

  return normalizeConfig(config);
}

/**
 * Compile vercel.ts to JSON and output to stdout
 */
async function compileConfig() {
  try {
    const config = await configureRouter();
    const json = JSON.stringify(config, null, 2);
    console.log(json);
  } catch (error) {
    console.error('Failed to compile config:', error);
    process.exit(1);
  }
}

/**
 * Validate the vercel.ts config
 */
async function validateConfig() {
  try {
    const config = await configureRouter();

    // Validate static fields
    validateStaticFields(config);

    console.log('✓ Config is valid');
    console.log(`  - buildCommand: ${config.buildCommand || '(not set)'}`);
    console.log(`  - framework: ${config.framework || '(not set)'}`);
    console.log(`  - routes: ${config.routes?.length || 0} route(s)`);
    console.log(`  - redirects: ${config.redirects?.length || 0} redirect(s)`);
    console.log(`  - rewrites: ${config.rewrites?.length || 0} rewrite(s)`);
    console.log(`  - headers: ${config.headers?.length || 0} header(s)`);
  } catch (error) {
    console.error('✗ Config validation failed:');
    console.error(`  ${error}`);
    process.exit(1);
  }
}

/**
 * Generate vercel.json file (for backwards compatibility / development)
 */
async function generateVercelConfig() {
  try {
    const config = await configureRouter();
    const json = JSON.stringify(config, null, 2);
    const outputPath = resolve(process.cwd(), 'vercel.json');

    writeFileSync(outputPath, json);
    console.log('Successfully generated vercel.json');
  } catch (error) {
    console.error('Failed to generate vercel.json:', error);
    process.exit(1);
  }
}

/**
 * CLI entry point
 */
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'compile':
      await compileConfig();
      break;
    case 'validate':
      await validateConfig();
      break;
    case 'generate':
    case undefined:
      // Default to generate for backwards compatibility
      await generateVercelConfig();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Available commands: compile, validate, generate');
      process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
