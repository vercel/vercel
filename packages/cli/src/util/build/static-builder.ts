import minimatch from 'minimatch';
import { BuildV2, Files } from '@vercel/build-utils';

export const version = 2;

export const build: BuildV2 = async ({ entrypoint, files, config }) => {
  const output: Files = {};
  const outputDirectory = config.zeroConfig ? config.outputDirectory : '';

  for (let [filename, fileFsRef] of Object.entries(files)) {
    if (
      filename.startsWith('.git/') ||
      filename === 'vercel.json' ||
      filename === 'now.json'
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

  return { routes: [], output };
};
