import fs from 'fs-extra';
import { resolve, basename } from 'path';
import { fileNameSymbol } from '@vercel/client';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import { readLocalConfig } from '../../util/config/files';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';
import { help, args } from './args';
import deploy from './latest';

export default async ctx => {
  const {
    authConfig,
    output,
    config: { currentTeam },
    apiUrl,
  } = ctx;

  let contextName = currentTeam || 'current user';
  let argv = null;

  try {
    argv = getArgs(ctx.argv.slice(2), args);
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

  let { localConfig } = ctx;
  if (!localConfig || localConfig instanceof Error) {
    localConfig = readLocalConfig(paths[0]);
  }
  const debugEnabled = argv['--debug'];
  const stats = {};

  if (argv['--help']) {
    output.print(help());
    return 2;
  }

  for (const path of paths) {
    try {
      stats[path] = await fs.lstat(path);
    } catch (err) {
      output.error(
        `The specified file or directory "${basename(path)}" does not exist.`
      );
      return 1;
    }
  }

  let client = null;

  if (authConfig && authConfig.token) {
    client = new Client({
      apiUrl,
      token: authConfig.token,
      currentTeam,
      output,
      debug: debugEnabled,
    });
    try {
      ({ contextName } = await getScope(client));
    } catch (err) {
      if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
        output.error(err.message);
        return 1;
      }

      throw err;
    }
  }

  if (localConfig) {
    const { version } = localConfig;
    const file = highlight(localConfig[fileNameSymbol]);
    const prop = code('version');

    if (version) {
      if (typeof version === 'number') {
        if (version !== 2) {
          const two = code(2);

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

  return deploy(ctx, contextName, output, stats, localConfig, args);
};
