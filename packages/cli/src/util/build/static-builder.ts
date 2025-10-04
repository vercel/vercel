import minimatch from 'minimatch';
import {
  shouldServe as defaultShouldServe,
  FileBlob,
} from '@vercel/build-utils';
import type { BuildV2, Files, ShouldServe } from '@vercel/build-utils';

export const version = 2;

export const build: BuildV2 = async ({ entrypoint, files, config }) => {
  const output: Files = {};
  const outputDirectory = config.zeroConfig ? config.outputDirectory : '';

  // eslint-disable-next-line prefer-const
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

    if (filename === '.npmrc' && config.allowUseNodeVersion) {
      // If the .npmrc file contains a `use-node-version` line, we remove it.
      const stream = fileFsRef.toStream();
      let content = '';
      await new Promise((resolve, reject) => {
        stream.on('data', chunk => {
          content += chunk.toString('utf8');
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      const updatedContent = content
        .split('\n')
        .filter(line => !line.includes('use-node-version'))
        .join('\n');
      output[filename] = new FileBlob({
        mode: fileFsRef.mode,
        contentType: fileFsRef.contentType,
        data: Buffer.from(updatedContent, 'utf8'),
      });
      continue;
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
