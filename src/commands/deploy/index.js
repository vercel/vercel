//@flow

import { resolve, basename } from 'path';
import { lstat } from 'fs-extra';
import { args as latestArgs, pipe as latestPipe } from './latest';
import { args as legacyArgs, pipe as legacyPipe } from './legacy';
import getScope from '../../util/get-scope';
import createOutput from '../../util/output';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import { readLocalConfig } from '../../util/config/files';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';
import type { CLIContext } from '../../util/types';

module.exports = async (ctx: CLIContext) => {
  const { authConfig, config: { currentTeam }, apiUrl } = ctx;
  const combinedArgs = Object.assign({}, legacyArgs, latestArgs);

  let platformVersion = null;
  let contextName = currentTeam || 'current user';
  let argv = null;

  try {
    argv = getArgs(ctx.argv.slice(2), combinedArgs);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv._[0] === 'deploy') {
    argv._.shift();
  }

  let paths = [];

  if (argv._.length > 0) {
    // If path is relative: resolve
    // if path is absolute: clear up strange `/` etc
    paths = argv._.map(item => resolve(process.cwd(), item));
  } else {
    paths = [process.cwd()];
  }

  const localConfig = readLocalConfig(paths[0]);
  const output = createOutput({ debug: argv['--debug'] });
  const isHelp = argv['--help'];
  const stats = {};

  for (const path of paths) {
    try {
      stats[path] = await lstat(path);
    } catch (err) {
      if (!isHelp) {
        output.error(
          `The specified file or directory "${basename(path)}" does not exist.`
        );
        return 1;
      }
    }
  }

  const isFile = stats.length === 1 && stats[paths[0]].isFile();

  if (authConfig && authConfig.token) {
    ({ contextName, platformVersion } = await getScope({
      apiUrl,
      token: authConfig.token,
      debug: false,
      currentTeam,
      includePlatformVersion: true
    }));
  }

  const file = highlight('now.json');
  const prop = code('version');

  if (!localConfig) {
    if (!isHelp && !isFile) {
      output.warn(
        `Your project is missing a ${file} file with a ${prop} property inside. More: htts://zeit.co/docs/version-config`
      );
    }
  } else {
    const { version } = localConfig;

    if (version) {
      if (typeof version === 'number') {
        if (version !== 1 && version !== 2) {
          const first = code(1);
          const second = code(2);

          output.error(
            `The value of the ${prop} property inside ${file} can only be ${first} or ${second}.`
          );
          return 1;
        }

        platformVersion = version;
      } else {
        output.error(
          `The ${prop} property inside your ${file} file must be a number.`
        );
        return 1;
      }
    } else if (!isHelp) {
      output.warn(
        `Your project is missing ${prop} in ${file}. More: htts://zeit.co/docs/version-config`
      );
    }
  }

  if (platformVersion === null || platformVersion > 1) {
    return latestPipe(
      ctx,
      contextName,
      output,
      stats,
      localConfig || {},
      isFile,
      platformVersion
    );
  }

  return legacyPipe(ctx, contextName, output);
};
