import { existsSync } from 'node:fs';
import { rm, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { build as rolldownBuild } from 'rolldown';
import { plugin } from './plugin.js';
import type { Files } from '@vercel/build-utils';
import type { RolldownOptions } from './types.js';

const __dirname__filenameShim = `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
`.trim();

export const rolldown = async (args: RolldownOptions) => {
  const entrypointPath = join(args.workPath, args.entrypoint);
  const outputDir = join(args.workPath, args.out);

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
  let resolvedFormat: 'esm' | 'cjs' | undefined =
    extensionInfo.format === 'auto' ? undefined : extensionInfo.format;

  // Always include package.json from the workPath
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
    if (extensionInfo.format === 'auto') {
      if (pkg.type === 'module') {
        resolvedFormat = 'esm';
      } else {
        resolvedFormat = 'cjs';
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
  const resolvedExtension = resolvedFormat === 'esm' ? 'mjs' : 'cjs';

  const context: { files: Files } = { files: {} };
  const out = await rolldownBuild({
    input: entrypointPath,
    cwd: args.workPath, // rolldown's cwd option
    platform: 'node',
    tsconfig: true,
    plugins: [
      plugin({
        repoRootPath: args.repoRootPath,
        outDir: outputDir,
        workPath: args.workPath,
        // Only shim CJS imports when output is ESM (CJS can require CJS natively)
        shimBareImports: resolvedFormat === 'esm',
        context,
      }),
    ],
    output: {
      cleanDir: true,
      dir: outputDir,
      format: resolvedFormat,
      entryFileNames: `[name].${resolvedExtension}`,
      preserveModules: true,
      preserveModulesRoot: args.repoRootPath,
      sourcemap: false,
      banner: resolvedFormat === 'esm' ? __dirname__filenameShim : undefined,
    },
  });
  let handler: string | null = null;
  for (const entry of out.output) {
    if (entry.type === 'chunk') {
      if (entry.isEntry) {
        handler = entry.fileName;
      }
    }
  }
  if (typeof handler !== 'string') {
    throw new Error(`Unable to resolve module for ${args.entrypoint}`);
  }

  const cleanup = async () => {
    await rm(outputDir, { recursive: true, force: true });
  };

  return {
    result: {
      handler,
      outputDir,
      outputFiles: context.files,
    },
    cleanup,
  };
};
