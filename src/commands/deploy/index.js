import { resolve, basename, parse } from 'path';
import { promises as fs } from 'fs';
import * as latest from './latest';
import * as legacy from './legacy';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import createOutput from '../../util/output';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import param from '../../util/output/param.ts';
import { readLocalConfig } from '../../util/config/files';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';

export default async ctx => {
  const { authConfig, config: { currentTeam }, apiUrl } = ctx;
  const combinedArgs = Object.assign({}, legacy.args, latest.args);

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
  const stats = {};
  const versionFlag = argv['--platform-version'];

  if (argv['--help']) {
    const lastArg = argv._[argv._.length - 1];
    const help = lastArg === 'deploy-v1' ? legacy.help : latest.help;

    output.print(help());
    return 2;
  }

  for (const path of paths) {
    try {
      stats[path] = await fs.lstat(path);
    } catch (err) {
      const { ext } = parse(path);

      if (versionFlag === 1 && !ext) {
        // This will ensure `-V 1 zeit/serve` (GitHub deployments) work. Since
        // GitHub repositories are never just one file, we need to set
        // the `isFile` property accordingly.
        stats[path] = {
          isFile: () => false
        };
      } else {
        output.error(
          `The specified file or directory "${basename(path)}" does not exist.`
        );
        return 1;
      }
    }
  }

  const isFile = Object.keys(stats).length === 1 && stats[paths[0]].isFile();

  if (authConfig && authConfig.token) {
    const client = new Client({
      apiUrl,
      token: authConfig.token,
      currentTeam,
      debug: false
    });
    try {
      ({ contextName, platformVersion } = await getScope(client));
    } catch (err) {
      if (err.code === 'not_authorized') {
        output.error(err.message);
        return 1;
      }

      throw err;
    }
  }

  const file = highlight('now.json');
  const prop = code('version');

  if (!localConfig) {
    if (!isFile) {
      output.warn(
        `Your project is missing a ${file} file with a ${prop} property. More: https://zeit.co/docs/version-config`
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
            `The value of the ${prop} property within ${file} can only be ${first} or ${second}.`
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
    } else {
      output.warn(
        `Your project is missing ${prop} in ${file}. More: https://zeit.co/docs/version-config`
      );
    }
  }

  if (versionFlag) {
    if (versionFlag !== 1 && versionFlag !== 2) {
      output.error(
        `The ${param('--platform-version')} option must be either ${code(
          '1'
        )} or ${code('2')}.`
      );
      return 1;
    }

    platformVersion = versionFlag;
  }

  if (platformVersion === null || platformVersion > 1) {
    return latest.pipe(
      ctx,
      contextName,
      output,
      stats,
      localConfig || {},
      isFile
    );
  }

  return legacy.pipe(ctx, contextName, output);
};
