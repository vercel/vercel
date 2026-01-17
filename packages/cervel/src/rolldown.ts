import { existsSync } from 'fs';
import { rm, readFile, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { build as rolldownBuild } from 'rolldown';

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

  const resolvedExtension = extensionInfo.extension;
  // Always include package.json from the entrypoint directory
  const packageJsonPath = join(args.workPath, 'package.json');
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
  }

  const relativeOutputDir = args.out;
  const outputDir = join(baseDir, relativeOutputDir);

  const isBundled = process.env.VERCEL_BUILDER_BUNDLE_NODE === '1';

  const external: string[] = [];
  if (!isBundled) {
    Object.entries(pkg.dependencies || {}).forEach(([key]) => {
      external.push(key);
    });
    Object.entries(pkg.devDependencies || {}).forEach(([key]) => {
      external.push(key);
    });
    Object.entries(pkg.peerDependencies || {}).forEach(([key]) => {
      external.push(key);
    });
  }

  const out = await rolldownBuild({
    // @ts-ignore tsconfig: true and cleanDir: true are not valid options
    input: entrypointPath,
    cwd: baseDir,
    platform: 'node',
    tsconfig: true,
    // Externalize native binaries (.node files) which can't be transpiled
    external,
    onLog: (level, log, defaultHandler) => {
      // Since we're processing node modules, suppress EVAL logs from internal packages
      // that we need to fix
      if (log.code === 'EVAL') {
        // Copied logic from build-utils, but avoiding a dep to keep this package decoupled
        if (process.env.VERCEL_BUILDER_DEBUG === '1') {
          defaultHandler(level, log);
        }
      } else {
        defaultHandler(level, log);
      }
    },
    output: {
      cleanDir: true,
      dir: outputDir,
      format: resolvedFormat,
      entryFileNames: `[name].${resolvedExtension}`,
      preserveModules: !isBundled,
      sourcemap: false,
      banner:
        resolvedFormat === 'esm'
          ? `import{fileURLToPath}from'url';import{dirname}from'path';const __filename=typeof import.meta.filename!=='undefined'?import.meta.filename:fileURLToPath(import.meta.url);const __dirname=typeof import.meta.dirname!=='undefined'?import.meta.dirname:dirname(__filename);`
          : undefined,
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

  // Write package.json with type: module so Node.js treats .js files as ESM
  if (resolvedFormat === 'esm') {
    const outputPkgJson = join(outputDir, 'package.json');
    await writeFile(outputPkgJson, JSON.stringify({ type: 'module' }, null, 2));
  }

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
