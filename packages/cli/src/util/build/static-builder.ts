import minimatch from 'minimatch';
import { shouldServe as defaultShouldServe } from '@vercel/build-utils';
import type { BuildV2, Files, ShouldServe } from '@vercel/build-utils';

export const version = 2;

const ALWAYS_EXCLUDED_PREFIXES = ['.git/', 'node_modules/'];
const ALWAYS_EXCLUDED_FILES = [
  'vercel.json',
  'vercel.toml',
  '.vercelignore',
  'now.json',
  '.nowignore',
];

const DEFAULT_EXCLUDED_FILES = [
  '.gitignore',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'README.md',
];

export const build: BuildV2 = async ({ entrypoint, files, config }) => {
  const output: Files = {};
  const outputDirectory = config.zeroConfig ? config.outputDirectory : '';

  for (let [filename, fileFsRef] of Object.entries(files)) {
    if (
      ALWAYS_EXCLUDED_PREFIXES.some(prefix => filename.startsWith(prefix)) ||
      ALWAYS_EXCLUDED_FILES.includes(filename) ||
      DEFAULT_EXCLUDED_FILES.includes(filename) ||
      filename.startsWith('.env')
    ) {
      continue;
    }

    if (
      entrypoint &&
      !(
        entrypoint === filename ||
        minimatch(filename, entrypoint, { dot: true })
      )
    ) {
      continue;
    }

    if (outputDirectory) {
      const outputMatch = outputDirectory + '/';
      if (filename.startsWith(outputMatch)) {
        // static output files are moved to the root directory
        filename = filename.slice(outputMatch.length);
      }
    }

    output[filename] = fileFsRef;
  }

  return { output };
};

export const shouldServe: ShouldServe = _opts => {
  const opts = { ..._opts };
  const {
    config: { zeroConfig, outputDirectory },
  } = opts;

  // Add the output directory prefix
  if (zeroConfig && outputDirectory) {
    opts.entrypoint = `${outputDirectory}/${opts.entrypoint}`;
    opts.requestPath = `${outputDirectory}/${opts.requestPath}`;
  }

  return defaultShouldServe(opts);
};
