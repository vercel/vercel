import type { Plugin } from 'rolldown';
import { readFile, cp } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { extname, dirname, join } from 'node:path';
import { traceNodeModules } from 'nf3';
import {
  exports as resolveExports,
  legacy as resolveLegacy,
} from 'resolve.exports';
import { nodeFileTrace as nft } from '@vercel/nft';

const CJS_SHIM_PREFIX = '\0cjs-shim:';

export const plugin = (args: {
  repoRootPath: string;
  outDir: string;
  cjsFiles?: string[]; // Files to treat as CommonJS
  shimBareImports?: boolean; // Whether to shim bare imports with CJS re-exports
}): Plugin => {
  // Cache for package.json contents, keyed by absolute path
  const packageJsonCache = new Map<string, any>();

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

      // Extract the subpath from the bare import (e.g., 'hono' or 'hono/middleware')
      const pkgName = pkgJson.name || '';
      const subpath = bareImport.startsWith(pkgName)
        ? bareImport.slice(pkgName.length) || '.'
        : '.';

      try {
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
          return true; // Matched the require condition
        }

        // Try to resolve with "import" condition (ESM)
        const importResult = resolveExports(pkgJson, subpath, {
          require: false,
          conditions: ['node', 'import'],
        });
        if (
          importResult?.some(
            p => p === relativePath || p === `./${relativePath}`
          )
        ) {
          return false; // Matched the import condition
        }
      } catch (err) {
        // If exports resolution fails, fall back to legacy resolution
        console.warn('Export resolution failed:', err);
      }

      // Fall back to legacy resolution (main/module fields)
      try {
        const legacyResult = resolveLegacy(pkgJson, {
          fields: ['module', 'main'],
        });
        if (legacyResult) {
          if (
            legacyResult === relativePath ||
            legacyResult === `./${relativePath}`
          ) {
            // If it matched "module" field, it's ESM
            if (
              pkgJson.module &&
              (legacyResult === pkgJson.module ||
                legacyResult === `./${pkgJson.module}`)
            ) {
              return false;
            }
            // If it matched "main" field, check type
            return pkgJson.type !== 'module';
          }
        }
      } catch {
        // Legacy resolution failed
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

        // If shimming is enabled and this is a bare import from source code
        if (args.shimBareImports && importer && isBareImport(id)) {
          // Only shim if it resolves to node_modules (external package)
          if (resolved?.id?.includes('node_modules')) {
            // Check if it's a CJS package
            const isCjs = await isCommonJS(id, resolved.id, resolved);

            if (isCjs) {
              // Create a shim for this CJS external import
              const shimId = `${CJS_SHIM_PREFIX}${id}`;
              return {
                id: shimId,
                external: false,
              };
            }
          }

          // Allow bare imports like @/lib that may be actually in the project dir
          if (resolved?.id?.includes('node_modules')) {
            return {
              external: true,
              // leave the import bare for runtime to resolve (eg. import from 'hono')
              id: id,
            };
          }
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
          const pkgName = id.slice(CJS_SHIM_PREFIX.length);

          // Generate CJS code that re-exports the bare import
          const code = `module.exports = require('${pkgName}');`;

          return {
            code,
          };
        }

        return null;
      },
    },
    writeBundle: {
      order: 'post',
      async handler() {
        // nf3 to trace node_modules
        await traceNodeModules(Array.from(tracedPaths), {
          outDir: args.outDir,
          rootDir: args.repoRootPath,
          nft: {},
        });
        // nft to to trace non-js files like .md, .json, etc.
        const result = await nft(Array.from(tracedPaths), {
          base: args.repoRootPath,
          ignore: path => {
            if (path.includes('node_modules')) {
              return true;
            }
            return false;
          },
        });
        for (const file of result.fileList) {
          const jsExtensions = [
            '.js',
            '.mjs',
            '.cjs',
            '.ts',
            '.mts',
            '.cts',
            '.jsx',
            '.tsx',
          ];
          // rolldown and nf3 already handle js files, so we only need to copy other files
          if (!jsExtensions.some(ext => file.endsWith(ext))) {
            const inputPath = join(args.repoRootPath, file);
            const outputPath = join(args.outDir, file);
            await cp(inputPath, outputPath);
          }
        }
      },
    },
  };
};
