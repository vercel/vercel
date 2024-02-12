import minimatch from 'minimatch';
import { shouldServe as defaultShouldServe } from '@vercel/build-utils';
import type { BuildV2, Files, ShouldServe } from '@vercel/build-utils';

export const version = 2;

export const build: BuildV2 = async ({ entrypoint, files, config }) => {
  const output: Files = {};
  const outputDirectory = config.zeroConfig ? config.outputDirectory : '';

  for (let [filename, fileFsRef] of Object.entries(files)) {
    if (
      filename.startsWith('.git/') ||
      filename === 'vercel.json' ||
      filename === '.vercelignore' ||
      filename === 'now.json' ||
      filename === '.nowignore' ||
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
