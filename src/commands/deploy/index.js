//@flow

import { resolve, basename } from 'path';
import { lstat } from 'fs-extra';
import { args as latestArgs, pipe as latestPipe } from './latest';
import { args as legacyArgs, pipe as legacyPipe } from './legacy';
import getContextName from '../../util/get-context-name';
import createOutput from '../../util/output';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import {readLocalConfig} from '../../util/config-files';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';
import type { CLIContext } from '../../util/types';

module.exports = async (ctx: CLIContext) => {
  const localConfig = readLocalConfig();
  const {authConfig, config: {currentTeam}, apiUrl} = ctx;
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
    argv._.shift()
  }

  let paths = []

  if (argv._.length > 0) {
    // If path is relative: resolve
    // if path is absolute: clear up strange `/` etc
    paths = argv._.map(item => resolve(process.cwd(), item))
  } else {
    paths = [process.cwd()]
  }

  const output = createOutput({ debug: argv['--debug'] });
  const isHelp = argv['-h'];

  for (const path of paths) {
    try {
      await lstat(path);
    } catch (err) {
      output.error(`The specified file or directory "${basename(path)}" does not exist`);
      return 1;
    }
  }

  if (authConfig && authConfig.token) {
    ({ contextName, platformVersion } = await getContextName({
      apiUrl,
      token: authConfig.token,
      debug: false,
      currentTeam,
      includePlatformVersion: true
    }));
  }

  const file = highlight('now.json');
  const prop = code('version');
  const fallback = highlight(platformVersion === null ? 'latest version' : `version ${platformVersion}`);

  if (!localConfig) {
    output.warn(`Your project is missing a ${file} file with a ${prop} property. Falling back to ${fallback}.`);
  } else if (!isHelp) {
    const {version} = localConfig;

    if (version) {
      if (typeof version === 'number') {
        if (version !== 1 && version !== 2) {
          const first = code(1);
          const second = code(2);

          output.error(`The value of the ${prop} property inside ${file} can only be ${first} or ${second}.`);
          return 1;
        }

        platformVersion = version;
      } else {
        output.error(`The ${prop} property inside your ${file} file must be a number.`);
        return 1;
      }
    } else {
      output.warn(`Your ${file} file is missing the ${prop} property. Falling back to ${fallback}.`);
    }
  }

  if (platformVersion === null || platformVersion > 1) {
    return latestPipe(ctx, contextName, output);
  }

  return legacyPipe(ctx, contextName, output);
}
