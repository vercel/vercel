import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Keep the public CommonJS barrel's getters, but initialize each re-exported
// module on first use. All exports still share one bundled module cache.
export function lazyEntryPlugin() {
  return {
    name: 'lazy-build-utils-entry',
    setup(build) {
      build.onLoad(
        { filter: /[/\\]build-utils[/\\]src[/\\]index\.ts$/ },
        async args => {
          const source = await readFile(args.path, 'utf8');
          let { code } = await transform(source, {
            loader: 'ts',
            format: 'cjs',
          });
          const imports = [];
          code = code.replace(
            /^var (import_\w+) = (.+);$/gm,
            (_, name, initializer) => {
              imports.push(name);
              return `var ${name};\nvar load_${name} = () => ${name} ??= ${initializer};`;
            }
          );
          if (imports.length === 0) {
            throw new Error(
              'Expected CommonJS imports in the build-utils barrel'
            );
          }
          for (const name of imports) {
            code = code.replaceAll(`() => ${name}.`, `() => load_${name}().`);
          }
          return { contents: code, loader: 'js' };
        }
      );
    },
  };
}
