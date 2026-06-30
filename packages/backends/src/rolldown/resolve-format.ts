import { extname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { BuildOptions } from '@vercel/build-utils';

export const resolveEntrypointAndFormat = async (
  args: Pick<BuildOptions, 'entrypoint' | 'workPath'> & {
    defaultFormat?: 'esm' | 'cjs';
  }
) => {
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
    extensionInfo.format === 'auto' ? args.defaultFormat : extensionInfo.format;

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
  if (!resolvedFormat) {
    // No `package.json` (and no explicit `defaultFormat`) to infer the module
    // format from. Default to ESM so a bare `server.ts`/`server.js` works out
    // of the box without requiring a `package.json` with `"type": "module"`.
    resolvedFormat = 'esm';
  }
  const resolvedExtension = resolvedFormat === 'esm' ? 'mjs' : 'cjs';
  return { format: resolvedFormat, extension: resolvedExtension };
};
