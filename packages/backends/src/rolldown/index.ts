import { BuildOptions, Span } from '@vercel/build-utils';
import type { Plugin, ResolvedId } from 'rolldown';
import { resolveEntrypointAndFormat } from './resolve-format.js';
import { build as rolldownBuild } from 'rolldown';
import { builtinModules } from 'node:module';
import { join, dirname, relative, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { type Files, FileBlob, isBackendFramework } from '@vercel/build-utils';
import { nft } from './nft.js';
import { exports as resolveExports } from 'resolve.exports';

const PLUGIN_NAME = 'vercel:backends';
const CJS_SHIM_PREFIX = '\0cjs-shim:';

export const rolldown = async (
  args: Pick<BuildOptions, 'entrypoint' | 'workPath' | 'repoRootPath'> & {
    span?: Span;
  }
) => {
  const files: Files = {};
  const { format, extension } = await resolveEntrypointAndFormat(args);
  const localBuildFiles = new Set<string>();
  let handler: string | null = null;

  // Cache for package.json contents
  const packageJsonCache = new Map<string, any>();

  // Track shim metadata: shimId -> { pkgDir, pkgName }
  const shimMeta = new Map<string, { pkgDir: string; pkgName: string }>();

  const framework = { slug: '', version: '' };

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
      packageJsonCache.set(pkgPath, null);
      return null;
    }
  };

  const isCommonJS = async (
    bareImport: string,
    resolvedPath: string,
    resolvedInfo: ResolvedId
  ): Promise<boolean> => {
    const ext = extname(resolvedPath);

    if (ext === '.cjs') return true;
    if (ext === '.mjs') return false;

    if (ext === '.js' || ext === '.ts') {
      const pkgJsonPath = resolvedInfo.packageJsonPath;
      if (!pkgJsonPath) return true;

      const pkgJson = await getPackageJson(pkgJsonPath);
      if (!pkgJson) return true;

      const pkgDir = dirname(pkgJsonPath);
      const relativePath = resolvedPath
        .slice(pkgDir.length + 1)
        .replace(/\\/g, '/');

      const pkgName = pkgJson.name || '';
      const subpath = bareImport.startsWith(pkgName)
        ? `.${bareImport.slice(pkgName.length)}` || '.'
        : '.';

      try {
        const importResult = resolveExports(pkgJson, subpath, {
          require: false,
          conditions: ['node', 'import'],
        });
        if (
          importResult?.some(
            p => p === relativePath || p === `./${relativePath}`
          )
        ) {
          return false;
        }

        const requireResult = resolveExports(pkgJson, subpath, {
          require: true,
          conditions: ['node', 'require'],
        });
        if (
          requireResult?.some(
            p => p === relativePath || p === `./${relativePath}`
          )
        ) {
          return true;
        }
      } catch {
        // Fall through to legacy resolution
      }

      if (pkgJson.module) return false;
      return pkgJson.type !== 'module';
    }

    return true;
  };

  const isBareImport = (id: string) => {
    return (
      !id.startsWith('.') &&
      !id.startsWith('/') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(id)
    );
  };

  const isNodeModule = (resolved: ResolvedId | null) => {
    return resolved?.id?.includes('node_modules') ?? false;
  };

  const isNodeBuiltin = (id: string) => {
    const normalizedId = id.includes(':') ? id.split(':')[1] : id;
    return builtinModules.includes(normalizedId);
  };

  const isLocalImport = (id: string) => {
    return !id.startsWith('node:') && !id.includes('node_modules');
  };

  const plugin = (): Plugin => {
    return {
      name: PLUGIN_NAME,
      resolveId: {
        order: 'pre',
        async handler(id, importer, rOpts) {
          // If this is already a shim, resolve normally
          if (id.startsWith(CJS_SHIM_PREFIX)) {
            return { id, external: false };
          }

          const resolved = await this.resolve(id, importer, rOpts);

          // Handle node builtins
          if (isNodeBuiltin(id)) {
            return {
              id: id.startsWith('node:') ? id : `node:${id}`,
              external: true,
            };
          }

          // Track local files for NFT
          if (resolved?.id && isLocalImport(resolved.id)) {
            localBuildFiles.add(resolved.id);
          } else if (!resolved) {
            // Entry point or unresolved local file
            localBuildFiles.add(join(args.workPath, id));
          }

          // If the importer is a shim, let bare imports be external (don't shim again)
          if (importer?.startsWith(CJS_SHIM_PREFIX) && isBareImport(id)) {
            return { id, external: true };
          }

          // Handle bare imports from node_modules
          if (importer && isBareImport(id) && isNodeModule(resolved)) {
            // Track framework info
            if (isBackendFramework(id) && resolved?.packageJsonPath) {
              try {
                const pkg = await readFile(resolved.packageJsonPath, 'utf8');
                const pkgJson = JSON.parse(pkg);
                framework.slug = pkgJson.name;
                framework.version = pkgJson.version;
              } catch {
                // ignore
              }
            }

            // Check if we need to shim CJS packages
            const isCjs = resolved
              ? await isCommonJS(id, resolved.id, resolved)
              : false;

            if (isCjs) {
              const importerResolved = await this.resolve(importer);
              const importerPkgJsonPath = importerResolved?.packageJsonPath;

              if (importerPkgJsonPath) {
                const importerPkgDir = relative(
                  args.repoRootPath,
                  dirname(importerPkgJsonPath)
                );
                const namespace = importerPkgDir.replace(/\//g, '_');
                const safeId = id.replace(/\//g, '_');
                const shimId = `${CJS_SHIM_PREFIX}${namespace}_${safeId}`;
                shimMeta.set(shimId, { pkgDir: importerPkgDir, pkgName: id });
                return { id: shimId, external: false };
              }

              // Fallback without package scoping
              const safeId = id.replace(/\//g, '_');
              const shimId = `${CJS_SHIM_PREFIX}${safeId}`;
              shimMeta.set(shimId, { pkgDir: '', pkgName: id });
              return { id: shimId, external: false };
            }

            // ESM package, keep as external
            return { id, external: true };
          }

          // Allow bare imports like @/lib that may be in the project dir
          if (importer && isBareImport(id)) {
            return resolved;
          }

          // Local files - bundle them
          if (resolved && !isNodeModule(resolved)) {
            return resolved;
          }

          return resolved;
        },
      },
      load: {
        async handler(id) {
          // Generate CJS shim code
          if (id.startsWith(CJS_SHIM_PREFIX)) {
            const meta = shimMeta.get(id);
            if (!meta) {
              const pkgName = id.slice(CJS_SHIM_PREFIX.length);
              return { code: `module.exports = require('${pkgName}');` };
            }

            const { pkgDir, pkgName } = meta;

            // pkgDir can be empty string if package.json is at repoRootPath
            const relativePathToPkgJson = pkgDir
              ? join('..', pkgDir, 'package.json')
              : '../package.json';
            const code = `
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const requireFromContext = createRequire(join(dirname(fileURLToPath(import.meta.url)), '${relativePathToPkgJson}'));
module.exports = requireFromContext('${pkgName}');
`.trim();
            return { code };
          }

          return null;
        },
      },
    };
  };

  const runRolldown = () =>
    rolldownBuild({
      input: args.entrypoint,
      write: false,
      cwd: args.workPath,
      platform: 'node',
      transform: {
        define:
          format === 'esm'
            ? {
                __dirname: 'import.meta.dirname',
                __filename: 'import.meta.filename',
              }
            : undefined,
      },
      tsconfig: true,
      plugins: [plugin()],
      output: {
        cleanDir: true,
        format,
        entryFileNames: `[name].${extension}`,
        preserveModules: true,
        preserveModulesRoot: args.repoRootPath,
        sourcemap: false,
      },
    });

  // Run rolldown bundling
  const rolldownSpan = args.span?.child('vc.builder.backends.rolldown');
  const out = (await rolldownSpan?.trace(runRolldown)) || (await runRolldown());

  for (const file of out.output) {
    if (file.type === 'chunk') {
      if (file.isEntry) {
        handler = file.fileName;
      }
      files[file.fileName] = new FileBlob({
        data: file.code,
        mode: 0o644,
      });
    }
  }

  await nft({
    ...args,
    localBuildFiles,
    files,
    span: rolldownSpan ?? new Span({ name: 'vc.builder.backends.nft' }),
    ignoreNodeModules: true,
  });

  if (!handler) {
    throw new Error(
      `Unable to resolve build handler for entrypoint: ${args.entrypoint}`
    );
  }
  return { files, handler, framework, localBuildFiles };
};
