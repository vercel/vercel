import { existsSync } from 'fs';
import { rm, readFile } from 'fs/promises';
import { extname, join } from 'path';
import { build as rolldownBuild } from 'rolldown';

/**
 * Escapes special regex characters in a string to treat it as a literal pattern.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  let resolvedFormat: 'esm' | 'cjs' | undefined =
    extensionInfo.format === 'auto' ? undefined : extensionInfo.format;

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

  const relativeOutputDir = args.out;
  const outputDir = join(baseDir, relativeOutputDir);

  const out = await rolldownBuild({
    // @ts-ignore tsconfig: true and cleanDir: true are not valid options
    input: entrypointPath,
    cwd: baseDir,
    platform: 'node',
    tsconfig: true,
    external: external.map(pkg => new RegExp(`^${escapeRegExp(pkg)}`)),
    output: {
      cleanDir: true,
      dir: outputDir,
      format: resolvedFormat,
      preserveModules: true,
      sourcemap: false,
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
      pkg,
      shouldAddSourcemapSupport,
      handler,
      outputDir,
    },
    cleanup,
  };
};
