import type { Plugin } from 'esbuild';
import type { FileSystem } from './esbuild-file-system-plugin';
import { createHash } from 'crypto';

export const ASSET_NAMESPACE = 'vc-blob-asset';

/**
 * Creates an esbuild plugin that resolves all `vc-blob-asset:*` imports.
 * This works in conjunction with the `esbuild-file-system-plugin` to
 * replace all the `new URL('PATH', import.meta.url)` into these `import _ from 'vc-blob-asset:PATH'` statements.
 */
export function createAssetFilePlugin(fileSystem: FileSystem) {
  const assets: { filePath: string; name: string }[] = [];
  const plugin: Plugin = {
    name: 'vc-asset-files',
    setup(b) {
      b.onResolve({ filter: /^vc-blob-asset:.+/ }, async args => {
        const importee = args.path.replace('vc-blob-asset:', '');
        const resolved = await fileSystem.resolveImportPath(
          args.importer,
          importee
        );
        if (!resolved) {
          return;
        }
        return {
          namespace: ASSET_NAMESPACE,
          path: resolved,
        };
      });

      b.onLoad({ filter: /.+/, namespace: ASSET_NAMESPACE }, async args => {
        const buffer = await fileSystem.readFile(args.path);
        const hash = createHash('sha1').update(buffer).digest('hex');
        assets.push({ filePath: args.path, name: hash });
        const blobUrl = `blob:${hash}`;
        const code = `export default new URL(${JSON.stringify(blobUrl)})`;
        return {
          contents: code,
          loader: 'js',
        };
      });
    },
  };
  return { plugin, assets };
}
