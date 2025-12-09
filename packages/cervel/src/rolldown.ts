import { existsSync } from 'fs';
import { rm, readFile } from 'fs/promises';
import { extname, join, relative } from 'path';
import { build as rolldownBuild } from 'rolldown';
import { findNearestTsconfig } from './typescript.js';

export const rolldown = async (args: {
  entrypoint: string;
  workPath: string;
  repoRootPath: string;
  out: string;
}) => {
  const baseDir = args.repoRootPath || args.workPath;
  const entrypointPath = join(args.workPath, args.entrypoint);
  const shouldAddSourcemapSupport = false;

  const extension = extname(args.entrypoint);
  const extensionMap: Record<
    string,
    { format: 'esm' | 'cjs' | 'auto'; extension: string }
  > = {
    '.ts': { format: 'auto', extension: 'js' },
    '.mts': { format: 'esm', extension: 'mjs' },
    '.cts': { format: 'cjs', extension: 'cjs' },
    '.cjs': { format: 'cjs', extension: 'cjs' },
    '.js': { format: 'auto', extension: 'js' },
    '.mjs': { format: 'esm', extension: 'mjs' },
  };

  const extensionInfo = extensionMap[extension] || extensionMap['.js'];
  let format = extensionInfo.format;

  // Always include package.json from the entrypoint directory
  const packageJsonPath = join(args.workPath, 'package.json');
  const external: string[] = [];
  let pkg: Record<string, unknown> = {};
  if (existsSync(packageJsonPath)) {
    const source = await readFile(packageJsonPath, 'utf8');
    try {
      pkg = JSON.parse(source.toString());
    } catch (_e) {
      pkg = {};
    }
    if (format === 'auto') {
      if (pkg.type === 'module') {
        format = 'esm';
      } else {
        format = 'cjs';
      }
    }
    for (const dependency of Object.keys(pkg.dependencies || {})) {
      external.push(dependency);
    }
    for (const dependency of Object.keys(pkg.devDependencies || {})) {
      external.push(dependency);
    }
    for (const dependency of Object.keys(pkg.peerDependencies || {})) {
      external.push(dependency);
    }
    for (const dependency of Object.keys(pkg.optionalDependencies || {})) {
      external.push(dependency);
    }
  }

  const tsconfig = await findNearestTsconfig(baseDir);
  const relativeOutputDir = args.out;
  const outputDir = join(baseDir, relativeOutputDir);
  let handler: string | null = null;
  // @ts-ignore TS doesn't like the tsconfig option, but it's here https://rolldown.rs/reference/config-options#tsconfig
  await rolldownBuild({
    input: entrypointPath,
    cwd: baseDir,
    platform: 'node',
    external: (source: string) => {
      if (source.startsWith('.') || source.startsWith('/')) {
        return false;
      }

      return external.some(pkg => {
        return source === pkg || source.startsWith(pkg + '/');
      });
    },
    tsconfig,
    output: {
      dir: outputDir,
      // FIXME: This is a bit messy, not sure what facadeModuleId even is and the only reason for renaming here
      // is to preserve the proper extension for mjs/cjs scenario.
      // There doesn't seem to be another way to do only specify the entrypoint extension.
      entryFileNames: info => {
        // need to find a better way to renaming. This special case because the facadeModuleId is rolldown:runtime
        if (info.name === 'rolldown_runtime') {
          return 'rolldown_runtime.js';
        }
        const facadeModuleId = info.facadeModuleId;
        if (!facadeModuleId) {
          throw new Error(`Unable to resolve module for ${info.name}`);
        }
        const relPath = relative(baseDir, facadeModuleId);
        const extension = extname(relPath);
        const extensionMap: Record<string, string> = {
          '.ts': '.js',
          '.mts': '.mjs',
          '.mjs': '.mjs',
          '.cts': '.cjs',
          '.cjs': '.cjs',
          '.js': '.js',
        };
        const ext = extensionMap[extension] || '.js';
        const nameWithJS = relPath.slice(0, -extension.length) + ext;
        if (info.isEntry) {
          handler = nameWithJS;
        }
        return nameWithJS;
      },
      format,
      preserveModules: true,
      sourcemap: false,
    },
  });
  if (typeof handler !== 'string') {
    throw new Error(`Unable to resolve module for ${args.entrypoint}`);
  }

  const cleanup = async () => {
    await rm(outputDir, { recursive: true, force: true });
  };

  return {
    result: {
      pkg,
      shouldAddSourcemapSupport,
      handler,
      outputDir,
    },
    cleanup,
  };
};
