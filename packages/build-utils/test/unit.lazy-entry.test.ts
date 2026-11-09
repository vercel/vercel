import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lazyEntryPlugin } from '../lazy-entry.mjs';

const entry = join(__dirname, '../src/index.ts');

async function loadBundle(lazy: boolean, minify = false) {
  const loaded: string[] = [];
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    minifySyntax: minify,
    minifyWhitespace: minify,
    plugins: [
      ...(lazy ? [lazyEntryPlugin()] : []),
      {
        name: 'observe-initialization',
        setup(build) {
          build.onLoad(
            { filter: /[/\\]src[/\\](schemas|node-entrypoint)\.ts$/ },
            async args => ({
              contents: `recordInitialization(${JSON.stringify(args.path)});\n${await readFile(args.path, 'utf8')}`,
              loader: 'ts',
            })
          );
        },
      },
    ],
  });
  const module = { exports: {} as Record<string, any> };
  new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    '__filename',
    'recordInitialization',
    result.outputFiles[0].text
  )(
    createRequire(entry),
    module,
    module.exports,
    dirname(entry),
    entry,
    (path: string) => loaded.push(path)
  );
  return { exports: module.exports, loaded };
}

describe('lazy build-utils entry', () => {
  it.each([
    false,
    true,
  ])('preserves public exports and lazy initialization (minify=%s)', async minify => {
    const eager = await loadBundle(false);
    const lazy = await loadBundle(true, minify);
    expect(eager.loaded).toHaveLength(2);
    expect(lazy.loaded).toEqual([]);
    expect(Object.keys(lazy.exports).sort()).toEqual(
      Object.keys(eager.exports).sort()
    );
    expect(lazy.loaded).toEqual([]);

    const schema = lazy.exports.getFunctionsSchema;
    expect(schema()).toEqual(eager.exports.getFunctionsSchema());
    expect(lazy.exports.getFunctionsSchema).toBe(schema);
    expect(lazy.loaded).toHaveLength(1);
    expect(typeof lazy.exports.isNodeEntrypoint).toBe('function');
    expect(lazy.loaded).toHaveLength(2);

    for (const name of Object.keys(eager.exports)) {
      expect(typeof lazy.exports[name], name).toBe(typeof eager.exports[name]);
      expect(lazy.exports[name], name).toBe(lazy.exports[name]);
      if (typeof eager.exports[name] === 'function') {
        expect(lazy.exports[name].name, name).toBe(eager.exports[name].name);
      }
    }
    const error = new lazy.exports.NowBuildError({
      message: 'test',
      code: 'TEST',
    });
    expect(error).toBeInstanceOf(lazy.exports.NowBuildError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('TEST');
  });
});
