import { FileBlob, FileFsRef, walkParentDirs } from '@vercel/build-utils';
import { BuildV2, Files } from '@vercel/build-utils/dist/types';
import { nodeFileTrace } from '@vercel/nft';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { extname, join, relative } from 'path';
import { build as rolldownBuild, RolldownPlugin } from 'rolldown';

export const rolldown = async (args: Parameters<BuildV2>[0]) => {
  const baseDir = args.repoRootPath || args.workPath;
  const entrypointPath = join(args.workPath, args.entrypoint);
  const files: Files = {};
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
  if (existsSync(packageJsonPath)) {
    const { mode } = lstatSync(packageJsonPath);
    const source = readFileSync(packageJsonPath);
    const relPath = relative(baseDir, packageJsonPath);
    let pkg;
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
    files[relPath] = new FileBlob({ data: source, mode });
  }

  const absoluteImportPlugin: RolldownPlugin = {
    name: 'absolute-import-resolver',
    resolveId(source: string) {
      if (external.includes(source)) {
        return { id: source, external: true };
      }
      return null;
    },
  };

  let tsconfigPath: string | null = join(baseDir, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    tsconfigPath = await walkParentDirs({
      base: baseDir,
      start: args.workPath,
      filename: 'tsconfig.json',
    });
  }

  const relativeOutputDir = join(
    '.vercel',
    'output',
    'functions',
    'index.func'
  );
  const outputDir = join(baseDir, relativeOutputDir);
  let handler: string | null = null;
  // @ts-ignore TS doesn't like the tsconfig option, but it's here https://rolldown.rs/reference/config-options#tsconfig
  await rolldownBuild({
    input: entrypointPath,
    cwd: baseDir,
    platform: 'node',
    external: /node_modules/,
    plugins: [absoluteImportPlugin],
    tsconfig: tsconfigPath || undefined,
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
  const nftResult = await nodeFileTrace([join(outputDir, handler)], {
    // This didn't work as I expected it to, didn't find node_modules
    // base: outputDir,
    // processCwd: outputDir,
    ignore: args.config.excludeFiles,
  });
  for (const file of nftResult.fileList) {
    if (file.startsWith(relativeOutputDir)) {
      const stats = lstatSync(file);
      const relPath = relative(outputDir, file);
      files[relPath] = new FileFsRef({
        fsPath: file,
        mode: stats.mode,
      });
    } else {
      const stats = lstatSync(file);
      files[file] = new FileFsRef({ fsPath: file, mode: stats.mode });
    }
  }
  return {
    files,
    shouldAddSourcemapSupport,
    handler,
    outputDir,
  };
};
