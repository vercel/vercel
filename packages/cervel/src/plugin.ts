import type { Plugin } from 'rolldown';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CJS_SHIM_PREFIX = '\0cjs-shim:';

const isWindows = process.platform === 'win32';
function escapeRegExp(string: string) {
  return string.replace(/[-\\^$*+?.()|[\]{}]/g, String.raw`\$&`);
}
function pathRegExp(string: string) {
  if (isWindows) string = string.replace(/\\/g, '/');
  let escaped = escapeRegExp(string);
  if (isWindows) escaped = escaped.replace(/\//g, String.raw`[/\\]`);
  return escaped;
}

export const plugin = (args: {
  rootDir: string;
  outDir: string;
  cjsFiles?: string[]; // Files to treat as CommonJS
  shimBareImports?: boolean; // Whether to shim bare imports with CJS re-exports
}): Plugin => {
  args;
  const exclude = [
    /^(?:[\0#~.]|[a-z0-9]{2,}:)|\?/,
    new RegExp('^' + pathRegExp(args.rootDir) + '(?!.*node_modules)'),
    // ...(opts?.exclude || []).map((p) => toPathRegExp(p))
  ];
  const isBareImport = (id: string) => {
    // Bare imports don't start with '.', '/', or protocol
    return (
      !id.startsWith('.') &&
      !id.startsWith('/') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(id)
    );
  };

  return {
    name: 'cervel',
    resolveId: {
      order: 'pre',
      async handler(id, importer, rOpts) {
        console.log({ id, importer, rOpts });
        // If this is already a shim, resolve normally
        if (id.startsWith(CJS_SHIM_PREFIX)) {
          return { id, external: false };
        }

        const resolved = await this.resolve(id, importer, rOpts);

        // If the importer is a shim, let bare imports be external (don't shim again!)
        if (importer?.startsWith(CJS_SHIM_PREFIX) && isBareImport(id)) {
          return {
            id,
            external: true,
          };
        }

        // If shimming is enabled and this is a bare import from source code
        if (args.shimBareImports && importer && isBareImport(id)) {
          // Don't shim if it's already resolved to node_modules (it's external)
          if (resolved?.id && !resolved.id.includes('node_modules')) {
            return resolved;
          }

          // Create a shim for this bare import
          const shimId = `${CJS_SHIM_PREFIX}${id}`;
          return {
            id: shimId,
            external: false,
          };
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
  };
};
