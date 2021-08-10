import fs from 'fs-extra';
import { resolve, basename } from 'path';
import { VercelConfig, fileNameSymbol } from '@vercel/client';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import { readLocalConfig } from '../../util/config/files';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';
import { help } from './args';
import deploy from './latest';
import Client from '../../util/client';

export default async (client: Client) => {
  const { output } = client;

  let argv = null;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--force': Boolean,
      '--with-cache': Boolean,
      '--public': Boolean,
      '--no-clipboard': Boolean,
      '--env': [String],
      '--build-env': [String],
      '--meta': [String],
      // This is not an array in favor of matching
      // the config property name.
      '--regions': String,
      '--prod': Boolean,
      '--confirm': Boolean,
      '-f': '--force',
      '-p': '--public',
      '-e': '--env',
      '-b': '--build-env',
      '-C': '--no-clipboard',
      '-m': '--meta',
      '-c': '--confirm',

      // deprecated
      '--name': String,
      '-n': '--name',
      '--target': String,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    output.print(help());
    return 2;
  }

  if (argv._[0] === 'deploy') {
    argv._.shift();
  }

  let paths;
  if (argv._.length > 0) {
    // If path is relative: resolve
    // if path is absolute: clear up strange `/` etc
    paths = argv._.map(item => resolve(process.cwd(), item));
  } else {
    paths = [process.cwd()];
  }

  let localConfig: VercelConfig | null = client.localConfig;
  if (!localConfig || localConfig instanceof Error) {
    localConfig = readLocalConfig(paths[0]);
  }

  for (const path of paths) {
    try {
      await fs.stat(path);
    } catch (err) {
      output.error(
        `The specified file or directory "${basename(path)}" does not exist.`
      );
      return 1;
    }
  }

  if (localConfig) {
    const { version } = localConfig;
    const file = highlight(localConfig[fileNameSymbol]!);
    const prop = code('version');

    if (version) {
      if (typeof version === 'number') {
        if (version !== 2) {
          const two = code(String(2));

          output.error(
            `The value of the ${prop} property within ${file} can only be ${two}.`
          );
          return 1;
        }
      } else {
        output.error(
          `The ${prop} property inside your ${file} file must be a number.`
        );
        return 1;
      }
    }
  }

  return deploy(client, paths, localConfig, argv);
};
