import { resolve, basename, parse } from 'path';
import { promises as fs } from 'fs';
import Client from '../../util/client.ts';
import getScope from '../../util/get-scope.ts';
import createOutput from '../../util/output';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import param from '../../util/output/param.ts';
import { readLocalConfig } from '../../util/config/files';
import getArgs from '../../util/get-args';
import * as parts from './args';
import { handleError } from '../../util/error';
import { generateProject } from '../../util/generate/generate-project'
import promptBool from '../../util/input/prompt-bool';

export default async ctx => {
  const { authConfig, config: { currentTeam }, apiUrl } = ctx;
  const combinedArgs = Object.assign({}, parts.legacyArgs, parts.latestArgs);

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

  let localConfig = readLocalConfig(paths[0]);
  const output = createOutput({ debug: argv['--debug'] });
  const stats = {};
  const versionFlag = argv['--platform-version'];

  if (argv['--help']) {
    const lastArg = argv._[argv._.length - 1];
    const help = lastArg === 'deploy-v1' ? parts.legacyHelp : parts.latestHelp;

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
      if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
        output.error(err.message);
        return 1;
      }

      throw err;
    }
  }

  const versions = [ 1, 2 ];
  const fileText = highlight('now.json');
  const versionText = code('version');
  const versionsText = code(versions.join(', '));

  if (versionFlag) {
    if (!versions.includes(versionFlag)) {
      output.error(
        `The ${param('--platform-version')} option can only be one of the following: ${versionsText}.`
      );

      return 1;
    }

    platformVersion = versionFlag;
  } else if (!localConfig) {
    if (isFile) {
      output.error(`There was an issue parsing ${fileText}`);
      return 1;
    }

    if (process.stdout.isTTY) {
      output.debug(`${fileText} not found, generating...`);
      const { config } = await generateProject(paths[0], output);

      if (!await promptBool('Would you like to deploy?', { defaultValue: true })) return 0;

      localConfig = config;
    } else {
      output.warn(
        `Your project is missing a ${fileText} file with a ${versionText} property. More: https://zeit.co/docs/version-config`
      );
    }
  }

  if (localConfig) {
    if (!localConfig.version) {
      output.warn(
        `Your project is missing ${versionText} in ${fileText}. More: https://zeit.co/docs/version-config`
      );
    } else if (typeof localConfig.version !== 'number') {
      output.error(
        `The ${versionText} property inside your ${fileText} file must be a number.`
      );

      return 1;
    } else if (!versions.includes(localConfig.version)) {
      output.error(
        `The value of the ${versionText} property within ${fileText} can only be one of the following: ${versionsText}.`
      );

      return 1;
    } else {
      platformVersion = localConfig.version;
    }
  }

  if (platformVersion === null || platformVersion > 1) {
    return require('./latest').default(
      ctx,
      contextName,
      output,
      stats,
      localConfig || {},
      isFile,
      parts.latestArgs
    );
  }

  return require('./legacy').default(ctx, contextName, output, parts.legacyArgsMri);
};
