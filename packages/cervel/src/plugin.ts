import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { extname, dirname, relative, join } from 'node:path';
import type { Plugin } from 'rolldown';
import { exports as resolveExports } from 'resolve.exports';
import { nodeFileTrace } from './node-file-trace.js';
import type { PluginOptions } from './types.js';

const CJS_SHIM_PREFIX = '\0cjs-shim:';

export const plugin = (args: PluginOptions): Plugin => {
  // Cache for package.json contents, keyed by absolute path
  const packageJsonCache = new Map<string, any>();

  // Track shim metadata: shimId -> { pkgDir, pkgName }
  const shimMeta = new Map<string, { pkgDir: string; pkgName: string }>();

  const tracedPaths = new Set<string>();

  const isBareImport = (id: string) => {
    // Bare imports don't start with '.', '/', or protocol
    return (
      !id.startsWith('.') &&
      !id.startsWith('/') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(id)
    );
  };

  /**
   * Read and cache package.json contents
   */
  const getPackageJson = async (pkgPath: string): Promise<any> => {
    if (packageJsonCache.has(pkgPath)) {
      return packageJsonCache.get(pkgPath);
    }

    try {
      const contents = await readFile(pkgPath, 'utf-8');
      const parsed = JSON.parse(contents);
      packageJsonCache.set(pkgPath, parsed);
      return parsed;
    } catch {
      // If we can't read it, cache null
      packageJsonCache.set(pkgPath, null);
      return null;
    }
  };

  /**
   * Determine if a resolved module is CommonJS based on package.json exports
   */
  const isCommonJS = async (
    bareImport: string,
    resolvedPath: string,
    resolvedInfo: any
  ): Promise<boolean> => {
    const ext = extname(resolvedPath);

    // Explicit CJS extension
    if (ext === '.cjs') return true;

    // Explicit ESM extension
    if (ext === '.mjs') return false;

    // For .js files, we need to check package.json
    if (ext === '.js' || ext === '.ts') {
      // Check if resolved info has package.json path
      const pkgJsonPath = resolvedInfo.packageJsonPath;
      if (!pkgJsonPath) {
        // No package.json info, default to CJS (Node.js default)
        return true;
      }

      const pkgJson = await getPackageJson(pkgJsonPath);
      if (!pkgJson) {
        // Couldn't read package.json, default to CJS
        return true;
      }

      // Get the package directory
      const pkgDir = dirname(pkgJsonPath);

      // Get the relative path from package root to resolved file (no leading ./)
      const relativePath = resolvedPath.startsWith(pkgDir)
        ? resolvedPath.slice(pkgDir.length + 1).replace(/\\/g, '/')
        : null;

      if (!relativePath) {
        // Can't determine relative path, fall back to type field
        return pkgJson.type !== 'module';
      }

      // Extract the subpath from the bare import (e.g., 'hono' -> '.', 'hono/middleware' -> './middleware')
      const pkgName = pkgJson.name || '';
      const subpath = bareImport.startsWith(pkgName)
        ? `.${bareImport.slice(pkgName.length)}` || '.'
        : '.';

      try {
        // Try to resolve with "import" condition (ESM) first
        const importResult = resolveExports(pkgJson, subpath, {
          require: false,
          conditions: ['node', 'import'],
        });
        if (
          importResult?.some(
            p => p === relativePath || p === `./${relativePath}`
          )
        ) {
          return false; // Matched the import condition, treat as ESM
        }

        // Try to resolve with "require" condition (CJS)
        const requireResult = resolveExports(pkgJson, subpath, {
          require: true,
          conditions: ['node', 'require'],
        });
        if (
          requireResult?.some(
            p => p === relativePath || p === `./${relativePath}`
          )
        ) {
          return true; // Matched the require condition, treat as CJS
        }
      } catch (err) {
        // If exports resolution fails, fall back to legacy resolution
        console.warn('Export resolution failed::', err);
      }

      // Fall back to legacy resolution (main/module fields)
      // If package has a "module" field, bundlers will use it, so treat as ESM
      if (pkgJson.module) {
        return false;
      }

      // Final fallback to type field
      return pkgJson.type !== 'module';
    }

    // Unknown extension, default to CJS
    return true;
  };

  const isLocalImport = (id: string) => {
    // Not local if it's a built-in module
    if (id.startsWith('node:')) return false;

    // Not local if it's in node_modules
    if (id.includes('node_modules')) return false;

    return true;
  };

  return {
    name: 'cervel',
    resolveId: {
      order: 'pre',
      async handler(id, importer, rOpts) {
        // If this is already a shim, resolve normally
        if (id.startsWith(CJS_SHIM_PREFIX)) {
          return { id, external: false };
        }

        const resolved = await this.resolve(id, importer, rOpts);

        if (builtinModules.includes(id)) {
          return {
            id: `node:${id}`,
            external: true,
          };
        }

        if (resolved?.id && isLocalImport(resolved.id)) {
          tracedPaths.add(resolved.id);
        }

        // If the importer is a shim, let bare imports be external (don't shim again!)
        if (importer?.startsWith(CJS_SHIM_PREFIX) && isBareImport(id)) {
          return {
            id,
            external: true,
          };
        }

        // Handle bare imports from node_modules
        if (
          importer &&
          isBareImport(id) &&
          resolved?.id?.includes('node_modules')
        ) {
          // If shimming is enabled, check if we need to shim CJS packages
          if (args.shimBareImports) {
            const isCjs = await isCommonJS(id, resolved.id, resolved);

            if (isCjs) {
              // Get the importer's package.json path for proper require context
              const importerResolved = await this.resolve(importer);
              const importerPkgJsonPath = importerResolved?.packageJsonPath;

              if (importerPkgJsonPath) {
                const importerPkgDir = relative(
                  args.repoRootPath,
                  dirname(importerPkgJsonPath)
                );

                // Create a namespaced shim: apps/api + jsonwebtoken -> apps_api_jsonwebtoken
                const namespace = importerPkgDir.replace(/\//g, '_');
                const shimId = `${CJS_SHIM_PREFIX}${namespace}_${id}`;
                shimMeta.set(shimId, { pkgDir: importerPkgDir, pkgName: id });
                return { id: shimId, external: false };
              }

              // Fallback: create a shim without package scoping
              const shimId = `${CJS_SHIM_PREFIX}${id}`;
              shimMeta.set(shimId, { pkgDir: '', pkgName: id });
              return { id: shimId, external: false };
            }
          }

          // Keep bare import for runtime resolution (don't use resolved path)
          return {
            external: true,
            id: id,
          };
        }

        // Allow bare imports like @/lib that may be in the project dir
        if (importer && isBareImport(id)) {
          return resolved;
        }

        // Mark everything else as external
        return {
          external: true,
          ...resolved,
          id: resolved?.id || id,
        };
      },
    },
    load: {
      async handler(id) {
        // If this is a CJS shim, generate the re-export code
        if (id.startsWith(CJS_SHIM_PREFIX)) {
          const meta = shimMeta.get(id);
          if (!meta) {
            // Shouldn't happen, but fallback
            const pkgName = id.slice(CJS_SHIM_PREFIX.length);
            return { code: `module.exports = require('${pkgName}');` };
          }

          const { pkgDir, pkgName } = meta;

          if (pkgDir) {
            // Shim is at _virtual/_cjs-shim_namespace_pkgname.js (flat)
            // Package.json is at {pkgDir}/package.json
            // Relative path: ../{pkgDir}/package.json
            const relativePathToPkgJson = join('..', pkgDir, 'package.json');

            const code = `
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const requireFromContext = createRequire(join(dirname(fileURLToPath(import.meta.url)), '${relativePathToPkgJson}'));
module.exports = requireFromContext('${pkgName}');
`.trim();

            return { code };
          }

          // Fallback to simple require (may not resolve correctly)
          return { code: `module.exports = require('${pkgName}');` };
        }

        return null;
      },
    },
    writeBundle: {
      order: 'post',
      async handler() {
        const files = await nodeFileTrace({
          outDir: args.outDir,
          tracedPaths: Array.from(tracedPaths),
          repoRootPath: args.repoRootPath,
          workPath: args.workPath,
          context: args.context,
          keepTracedPaths: false,
        });
        args.context.files = files;
      },
    },
  };
};
