import path from 'path';
import * as esbuild from 'esbuild';

const processInjectFile = `
const env = {};

// envOverride is passed by esbuild plugin
if (typeof envOverride === 'object') {
    Object.assign(env, envOverride || {});
}
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

export function nodeProcessPolyfillPlugin({
  envOverride = {},
} = {}): esbuild.Plugin {
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
          envOverride
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
