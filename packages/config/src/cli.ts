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

  // Merge: export const declarations take precedence over default export
  return {
    ...routerConfig,
    ...exportedConstants,
  };
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
