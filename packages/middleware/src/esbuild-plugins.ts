import path from 'path';
import * as esbuild from 'esbuild';

const processInjectFile = `
// envOverride is passed by esbuild plugin
const env = envOverride
function cwd() {
    return '/'
}
function chdir(dir) {
    throw new Error('process.chdir is not supported')
}
export const process = {
  argv: [],
  env,
  chdir,
  cwd,
};
`;

export function nodeProcessPolyfillPlugin({ env = {} } = {}): esbuild.Plugin {
  return {
    name: 'node-process-polyfill',
    setup({ initialOptions, onResolve, onLoad }) {
      onResolve({ filter: /_virtual-process-polyfill_\.js/ }, ({ path }) => {
        return {
          path,
          sideEffects: false,
        };
      });

      onLoad({ filter: /_virtual-process-polyfill_\.js/ }, () => {
        const contents = `const envOverride = ${JSON.stringify(
          env
        )};\n${processInjectFile}`;
        return {
          loader: 'js',
          contents,
        };
      });

      const polyfills = [
        path.resolve(__dirname, '_virtual-process-polyfill_.js'),
      ];
      if (initialOptions.inject) {
        initialOptions.inject.push(...polyfills);
      } else {
        initialOptions.inject = [...polyfills];
      }
    },
  };
}
