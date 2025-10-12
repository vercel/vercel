import {
  getPrettyError,
  getSupportedNodeVersion,
  scanParentDirs,
} from '@vercel/build-utils';
import {
  type Dictionary,
  fileNameSymbol,
  VALID_ARCHIVE_FORMATS,
  type VercelConfig,
} from '@vercel/client';
import { errorToString, isError } from '@vercel/error-utils';
import bytes from 'bytes';
import chalk from 'chalk';
import fs from 'fs-extra';
import ms from 'ms';
import { join, resolve } from 'path';
import Now, { type CreateOptions } from '../../util';
import type Client from '../../util/client';
import { readLocalConfig } from '../../util/config/files';
import { createGitMeta } from '../../util/create-git-meta';
import createDeploy from '../../util/deploy/create-deploy';
import { getDeploymentChecks } from '../../util/deploy/get-deployment-checks';
import getPrebuiltJson from '../../util/deploy/get-prebuilt-json';
import { printDeploymentStatus } from '../../util/deploy/print-deployment-status';
import { isValidArchive } from '../../util/deploy/validate-archive-format';
import purchaseDomainIfAvailable from '../../util/domains/purchase-domain-if-available';
import { emoji, prependEmoji } from '../../util/emoji';
import { printError } from '../../util/error';
import { SchemaValidationFailed } from '../../util/errors-ts';
import {
  AliasDomainConfigured,
  BuildError,
  BuildsRateLimited,
  ConflictingFilePath,
  ConflictingPathSegment,
  DeploymentNotFound,
  DeploymentsRateLimited,
  DomainNotFound,
  DomainNotVerified,
  DomainPermissionDenied,
  DomainVerificationFailed,
  InvalidDomain,
  isAPIError,
  MissingBuildScript,
  NotDomainOwner,
  TooManyRequests,
  UserAborted,
} from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import getDeployment from '../../util/get-deployment';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getProjectName from '../../util/get-project-name';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import param from '../../util/output/param';
import stamp from '../../util/output/stamp';
import { parseEnv } from '../../util/parse-env';
import parseMeta from '../../util/parse-meta';
import { getCommandName } from '../../util/pkg-name';
import { pickOverrides } from '../../util/projects/project-settings';
import validatePaths, {
  validateRootDirectory,
} from '../../util/validate-paths';
import { help } from '../help';
import { deployCommand, deprecatedArchiveSplitTgz } from './command';
import parseTarget from '../../util/parse-target';
import { DeployTelemetryClient } from '../../util/telemetry/commands/deploy';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import { UploadErrorMissingArchive } from '../../util/deploy/process-deployment';
import { displayBuildLogsUntilFinalError } from '../../util/logs';
import { determineAgent } from '@vercel/detect-agent';

export default async (client: Client): Promise<number> => {
  const telemetryClient = new DeployTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;

  const flagsSpecification = getFlagsSpecification(deployCommand.options);

  // #region Argument Parsing
  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);

    telemetryClient.trackCliOptionArchive(parsedArguments.flags['--archive']);
    telemetryClient.trackCliOptionEnv(parsedArguments.flags['--env']);
    telemetryClient.trackCliOptionBuildEnv(
      parsedArguments.flags['--build-env']
    );
    telemetryClient.trackCliOptionMeta(parsedArguments.flags['--meta']);
    telemetryClient.trackCliFlagPrebuilt(parsedArguments.flags['--prebuilt']);
    telemetryClient.trackCliOptionRegions(parsedArguments.flags['--regions']);
    telemetryClient.trackCliFlagNoWait(parsedArguments.flags['--no-wait']);
    telemetryClient.trackCliFlagYes(parsedArguments.flags['--yes']);
    telemetryClient.trackCliOptionTarget(parsedArguments.flags['--target']);
    telemetryClient.trackCliFlagProd(parsedArguments.flags['--prod']);
    telemetryClient.trackCliFlagSkipDomain(
      parsedArguments.flags['--skip-domain']
    );
    telemetryClient.trackCliFlagPublic(parsedArguments.flags['--public']);
    telemetryClient.trackCliFlagLogs(parsedArguments.flags['--logs']);
    telemetryClient.trackCliFlagNoLogs(parsedArguments.flags['--no-logs']);
    telemetryClient.trackCliFlagGuidance(parsedArguments.flags['--guidance']);
    telemetryClient.trackCliFlagForce(parsedArguments.flags['--force']);
    telemetryClient.trackCliFlagWithCache(
      parsedArguments.flags['--with-cache']
    );

    if ('--confirm' in parsedArguments.flags) {
      telemetryClient.trackCliFlagConfirm(parsedArguments.flags['--confirm']);
      output.warn('`--confirm` is deprecated, please use `--yes` instead');
      parsedArguments.flags['--yes'] = parsedArguments.flags['--confirm'];
    }

    if ('--no-logs' in parsedArguments.flags) {
      output.warn('`--no-logs` is deprecated and now the default behavior.');
    }
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    telemetryClient.trackCliFlagHelp('deploy');
    output.print(help(deployCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArguments.args[0] === deployCommand.name) {
    parsedArguments.args.shift();
  }
  // #endregion

  // #region Path validation
  let paths;
  if (parsedArguments.args.length > 0) {
    // If path is relative: resolve
    // if path is absolute: clear up strange `/` etc
    paths = parsedArguments.args.map(item => resolve(client.cwd, item));
    telemetryClient.trackCliArgumentProjectPath(paths[0]);
  } else {
    paths = [client.cwd];
  }

  // check paths
  const pathValidation = await validatePaths(client, paths);

  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }
  // #endregion

  // #region Config loading
  let localConfig = client.localConfig || readLocalConfig(paths[0]);

  if (localConfig) {
    client.localConfig = localConfig;
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

  const { log, debug, error, prettyError } = output;

  const quiet = !client.stdout.isTTY;

  let { path: cwd } = pathValidation;
  const autoConfirm = parsedArguments.flags['--yes'];
  // #endregion

  // #region Warning on flags
  // deprecate --name
  if (parsedArguments.flags['--name']) {
    output.print(
      `${prependEmoji(
        `The ${param(
          '--name'
        )} option is deprecated (https://vercel.link/name-flag)`,
        emoji('warning')
      )}\n`
    );
    telemetryClient.trackCliOptionName(parsedArguments.flags['--name']);
  }

  if (parsedArguments.flags['--no-clipboard']) {
    output.print(
      `${prependEmoji(
        `The ${param(
          '--no-clipboard'
        )} option was ignored because it is the default behavior. Please remove it.`,
        emoji('warning')
      )}\n`
    );
    telemetryClient.trackCliFlagNoClipboard(true);
  }
  // #endregion

  const target = parseTarget({
    flagName: 'target',
    flags: parsedArguments.flags,
  });

  const parsedArchive = parsedArguments.flags['--archive'];
  if (
    typeof parsedArchive === 'string' &&
    !(
      isValidArchive(parsedArchive) ||
      parsedArchive === deprecatedArchiveSplitTgz
    )
  ) {
    output.error(`Format must be one of: ${VALID_ARCHIVE_FORMATS.join(', ')}`);
    return 1;
  }
  if (parsedArchive === deprecatedArchiveSplitTgz) {
    output.print(
      `${prependEmoji(
        `${param('--archive=tgz')} now has the same behavior as ${param(
          '--archive=split-tgz'
        )}. Please use ${param('--archive=tgz')} instead.`,
        emoji('warning')
      )}\n`
    );
  }

  // Retrieve `project` and `org` from linked Project.
  // If not linked, prompt user to set up a new Project.
  const link = await ensureLink('deploy', client, cwd, {
    autoConfirm,
    setupMsg: 'Set up and deploy',
    projectName: getProjectName({
      nameParam: parsedArguments.flags['--name'],
      nowConfig: localConfig,
      paths,
    }),
  });
  if (typeof link === 'number') {
    return link;
  }

  const { org, project } = link;
  const rootDirectory = project.rootDirectory;
  const sourceFilesOutsideRootDirectory =
    project.sourceFilesOutsideRootDirectory ?? true;

  // For repo-style linking, reset the path to the root of the repository
  if (link.repoRoot) {
    cwd = link.repoRoot;
  }

  // #region Build `--prebuilt`
  let vercelOutputDir: string | undefined;
  if (parsedArguments.flags['--prebuilt']) {
    vercelOutputDir = join(cwd, '.vercel/output');

    // For repo-style linking, update `cwd` to be the Project
    // subdirectory when `rootDirectory` setting is defined
    if (link.repoRoot && link.project.rootDirectory) {
      vercelOutputDir = join(cwd, link.project.rootDirectory, '.vercel/output');
    }

    const prebuiltExists = await fs.pathExists(vercelOutputDir);
    if (!prebuiltExists) {
      error(
        `The ${param(
          '--prebuilt'
        )} option was used, but no prebuilt output found in ".vercel/output". Run ${getCommandName(
          'build'
        )} to generate a local build.`
      );
      return 1;
    }

    const prebuiltBuild = await getPrebuiltJson(vercelOutputDir);

    // Ensure that there was not a build error
    const prebuiltError =
      prebuiltBuild?.error ||
      prebuiltBuild?.builds?.find(build => 'error' in build)?.error;
    if (prebuiltError) {
      output.log(
        `Prebuilt deployment cannot be created because ${getCommandName(
          'build'
        )} failed with error:\n`
      );
      prettyError(prebuiltError);
      return 1;
    }

    // Ensure that the deploy target matches the build target
    const assumedTarget = target || 'preview';
    if (prebuiltBuild?.target && prebuiltBuild.target !== assumedTarget) {
      let specifyTarget = '';
      if (prebuiltBuild.target === 'production') {
        specifyTarget = ` --prod`;
      }

      prettyError({
        message: `The ${param(
          '--prebuilt'
        )} option was used with the target environment "${assumedTarget}", but the prebuilt output found in ".vercel/output" was built with target environment "${
          prebuiltBuild.target
        }". Please run ${getCommandName(`--prebuilt${specifyTarget}`)}.`,
        link: 'https://vercel.link/prebuilt-environment-mismatch',
      });
      return 1;
    }
  }
  // #endregion

  // Set the `contextName` and `currentTeam` as specified by the
  // Project Settings, so that API calls happen with the proper scope
  const contextName = org.slug;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  if (
    rootDirectory &&
    (await validateRootDirectory(
      cwd,
      join(cwd, rootDirectory),
      project
        ? `To change your Project Settings, go to https://vercel.com/${org?.slug}/${project.name}/settings`
        : ''
    )) === false
  ) {
    return 1;
  }

  // If Root Directory is used we'll try to read the config
  // from there instead and use it if it exists.
  if (rootDirectory) {
    const rootDirectoryConfig = readLocalConfig(join(cwd, rootDirectory));

    if (rootDirectoryConfig) {
      debug(`Read local config from root directory (${rootDirectory})`);
      localConfig = rootDirectoryConfig;
    } else if (localConfig) {
      output.print(
        `${prependEmoji(
          `The ${highlight(
            localConfig[fileNameSymbol]!
          )} file should be inside of the provided root directory.`,
          emoji('warning')
        )}\n`
      );
    }
  }

  localConfig = localConfig || {};

  if (localConfig.name) {
    output.print(
      `${prependEmoji(
        `The ${code('name')} property in ${highlight(
          localConfig[fileNameSymbol]!
        )} is deprecated (https://vercel.link/name-prop)`,
        emoji('warning')
      )}\n`
    );
  }

  // #region Build deployment
  const isObject = (item: any) =>
    Object.prototype.toString.call(item) === '[object Object]';

  // This validation needs to happen on the client side because
  // the data is merged with other data before it is passed to the API (which
  // also does schema validation).
  if (typeof localConfig.env !== 'undefined' && !isObject(localConfig.env)) {
    error(
      `The ${code('env')} property in ${highlight(
        localConfig[fileNameSymbol]!
      )} needs to be an object`
    );
    return 1;
  }

  if (typeof localConfig.build !== 'undefined') {
    if (!isObject(localConfig.build)) {
      error(
        `The ${code('build')} property in ${highlight(
          localConfig[fileNameSymbol]!
        )} needs to be an object`
      );
      return 1;
    }

    if (
      typeof localConfig.build.env !== 'undefined' &&
      !isObject(localConfig.build.env)
    ) {
      error(
        `The ${code('build.env')} property in ${highlight(
          localConfig[fileNameSymbol]!
        )} needs to be an object`
      );
      return 1;
    }
  }

  // #region Meta
  const meta = Object.assign(
    {},
    parseMeta(localConfig.meta),
    parseMeta(parsedArguments.flags['--meta'])
  );

  const gitMetadata = await createGitMeta(cwd, project);
  // #endregion

  // #region Env vars validation
  // Merge dotenv config, `env` from vercel.json, and `--env` / `-e` arguments
  const deploymentEnv = Object.assign(
    {},
    parseEnv(localConfig.env),
    parseEnv(parsedArguments.flags['--env'])
  );

  // Merge build env out of  `build.env` from vercel.json, and `--build-env` args
  const deploymentBuildEnv = Object.assign(
    {},
    parseEnv(localConfig.build && localConfig.build.env),
    parseEnv(parsedArguments.flags['--build-env'])
  );

  // If there's any undefined values, then inherit them from this process
  try {
    await addProcessEnv(log, deploymentEnv);
    await addProcessEnv(log, deploymentBuildEnv);
  } catch (err: unknown) {
    error(errorToString(err));
    return 1;
  }
  // #endregion

  // #region Regions
  const regionFlag = (parsedArguments.flags['--regions'] || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  const regions = regionFlag.length > 0 ? regionFlag : localConfig.regions;
  // #endregion

  const currentTeam = org.type === 'team' ? org.id : undefined;
  const now = new Now({
    client,
    currentTeam,
  });
  const deployStamp = stamp();
  let deployment = null;
  const noWait = !!parsedArguments.flags['--no-wait'];
  const withLogs = parsedArguments.flags['--logs'] ? true : false;

  const localConfigurationOverrides = pickOverrides(localConfig);

  const name = project.name;
  if (!name) {
    throw new Error(
      '`name` not found on project or provided by existing project'
    );
  }

  try {
    // if this flag is not set, use `undefined` to allow the project setting to be used
    const autoAssignCustomDomains = parsedArguments.flags['--skip-domain']
      ? false
      : undefined;

    const createArgs: CreateOptions = {
      name,
      env: deploymentEnv as Dictionary<string>,
      build: { env: deploymentBuildEnv as Dictionary<string> },
      forceNew: parsedArguments.flags['--force'],
      withCache: parsedArguments.flags['--with-cache'],
      prebuilt: parsedArguments.flags['--prebuilt'],
      vercelOutputDir,
      rootDirectory,
      quiet,
      wantsPublic: Boolean(
        parsedArguments.flags['--public'] || localConfig.public
      ),
      nowConfig: {
        ...localConfig,
        // `images` is allowed in "vercel.json" and processed
        // by `vc build`, but don't send it to the API endpoint
        images: undefined,
      },
      regions,
      meta,
      gitMetadata,
      deployStamp,
      target,
      skipAutoDetectionConfirmation: autoConfirm,
      noWait,
      withLogs,
      autoAssignCustomDomains,
    };

    if (!localConfig.builds || localConfig.builds.length === 0) {
      // Only add projectSettings for zero config deployments
      createArgs.projectSettings = {
        sourceFilesOutsideRootDirectory,
        rootDirectory,
        ...localConfigurationOverrides,
      };
    }

    // Read the `engines.node` field from `package.json` and send as a
    // `projectSettings` property as an optimization (so that the API
    // does not need to retrieve the file to do this check).
    const { packageJson } = await scanParentDirs(
      join(cwd, project?.rootDirectory ?? ''),
      true,
      cwd
    );
    let nodeVersion: string | undefined;
    if (packageJson?.engines?.node) {
      try {
        const { range } = await getSupportedNodeVersion(
          packageJson.engines.node
        );
        nodeVersion = range;
      } catch (error) {
        if (error instanceof Error) {
          output.warn(error.message);
        }
      }
    }
    if (!createArgs.projectSettings) createArgs.projectSettings = {};
    createArgs.projectSettings.nodeVersion = nodeVersion;

    deployment = await createDeploy(
      client,
      now,
      contextName,
      cwd,
      createArgs,
      org,
      !project,
      parsedArchive ? 'tgz' : undefined
    );

    if (deployment instanceof NotDomainOwner) {
      output.error(deployment.message);
      return 1;
    }

    if (deployment instanceof Error) {
      output.error(
        deployment.message ||
          'An unexpected error occurred while deploying your project',
        undefined,
        'https://vercel.link/help',
        'Contact Support'
      );
      return 1;
    }

    if (deployment.readyState === 'CANCELED') {
      output.print('The deployment has been canceled.\n');
      return 1;
    }

    if (deployment.checksConclusion === 'failed') {
      const { checks } = await getDeploymentChecks(client, deployment.id);
      const counters = new Map<string, number>();
      checks.forEach(c => {
        counters.set(c.conclusion, (counters.get(c.conclusion) ?? 0) + 1);
      });

      const counterList = Array.from(counters)
        .map(([name, no]) => `${no} ${name}`)
        .join(', ');
      output.error(`Running Checks: ${counterList}`);
      return 1;
    }

    if (!noWait) {
      // get the deployment just to double check that it actually deployed
      await getDeployment(client, contextName, deployment.id);
    }

    if (deployment === null) {
      error('Uploading failed. Please try again.');
      return 1;
    }
  } catch (err: unknown) {
    if (isError(err)) {
      debug(`Error: ${err}\n${err.stack}`);
    }

    if (err instanceof UploadErrorMissingArchive) {
      output.prettyError(err);
      return 1;
    }

    if (err instanceof NotDomainOwner) {
      output.error(err.message);
      return 1;
    }

    if (err instanceof DomainNotFound && err.meta && err.meta.domain) {
      output.debug(
        `The domain ${err.meta.domain} was not found, trying to purchase it`
      );

      const purchase = await purchaseDomainIfAvailable(
        client,
        err.meta.domain,
        contextName
      );

      if (purchase === true) {
        output.success(`Successfully purchased the domain ${err.meta.domain}!`);

        // We exit if the purchase is completed since
        // the domain verification can take some time
        return 0;
      }

      if (purchase === false || purchase instanceof UserAborted) {
        handleCreateDeployError(deployment, localConfig);
        return 1;
      }

      handleCreateDeployError(purchase, localConfig);
      return 1;
    }

    if (
      err instanceof DomainNotFound ||
      err instanceof DomainNotVerified ||
      err instanceof NotDomainOwner ||
      err instanceof DomainPermissionDenied ||
      err instanceof DomainVerificationFailed ||
      err instanceof SchemaValidationFailed ||
      err instanceof InvalidDomain ||
      err instanceof DeploymentNotFound ||
      err instanceof BuildsRateLimited ||
      err instanceof DeploymentsRateLimited ||
      err instanceof AliasDomainConfigured ||
      err instanceof MissingBuildScript ||
      err instanceof ConflictingFilePath ||
      err instanceof ConflictingPathSegment
    ) {
      handleCreateDeployError(err, localConfig);
      return 1;
    }

    if (err instanceof BuildError) {
      if (withLogs === false) {
        try {
          if (now.url) {
            const failedDeployment = await getDeployment(
              client,
              contextName,
              now.url
            );
            await displayBuildLogsUntilFinalError(
              client,
              failedDeployment,
              err.message
            );
          }
        } catch (_) {
          output.log(
            `To check build logs run: ${getCommandName(
              `inspect ${now.url} --logs`
            )}`
          );
          output.log(
            `Or inspect them in your browser at https://${now.url}/_logs`
          );
        }
      }

      return 1;
    }

    if (isAPIError(err) && err.code === 'size_limit_exceeded') {
      const { sizeLimit = 0 } = err;
      const message = `File size limit exceeded (${bytes(sizeLimit)})`;
      error(message);
      return 1;
    }

    printError(err);
    return 1;
  }

  const { isAgent } = await determineAgent();
  const guidanceMode = parsedArguments.flags['--guidance'] ?? isAgent;
  return printDeploymentStatus(deployment, deployStamp, noWait, guidanceMode);
};

function handleCreateDeployError(error: Error, localConfig: VercelConfig) {
  if (error instanceof InvalidDomain) {
    output.error(`The domain ${error.meta.domain} is not valid`);
    return 1;
  }
  if (error instanceof DomainVerificationFailed) {
    output.error(
      `The domain used as a suffix ${chalk.underline(
        error.meta.domain
      )} is not verified and can't be used as custom suffix.`
    );
    return 1;
  }
  if (error instanceof DomainPermissionDenied) {
    output.error(
      `You don't have permissions to access the domain used as a suffix ${chalk.underline(
        error.meta.domain
      )}.`
    );
    return 1;
  }
  if (error instanceof SchemaValidationFailed) {
    const niceError = getPrettyError(error.meta);
    const fileName = localConfig[fileNameSymbol] || 'vercel.json';
    niceError.message = `Invalid ${fileName} - ${niceError.message}`;
    output.prettyError(niceError);
    return 1;
  }
  if (error instanceof TooManyRequests) {
    output.error(
      `Too many requests detected for ${error.meta.api} API. Try again in ${ms(
        error.meta.retryAfter * 1000,
        {
          long: true,
        }
      )}.`
    );
    return 1;
  }
  if (error instanceof DomainNotVerified) {
    output.error(
      `The domain used as an alias ${chalk.underline(
        error.meta.domain
      )} is not verified yet. Please verify it.`
    );
    return 1;
  }
  if (error instanceof BuildsRateLimited) {
    output.error(error.message);
    output.note(
      `Run ${getCommandName('upgrade')} to increase your builds limit.`
    );
    return 1;
  }
  if (
    error instanceof DeploymentNotFound ||
    error instanceof NotDomainOwner ||
    error instanceof DeploymentsRateLimited ||
    error instanceof AliasDomainConfigured ||
    error instanceof MissingBuildScript ||
    error instanceof ConflictingFilePath ||
    error instanceof ConflictingPathSegment
  ) {
    output.error(error.message);
    return 1;
  }

  return error;
}

/**
 * Adds missing environment variables from process.env to the provided env object.
 * @param {Function} log - The logging function.
 * @param {Object} env - The environment object to add missing variables to.
 * @returns {Promise<void>} - A promise that resolves when all missing variables are added.
 * @throws {Error} - If a missing variable is not found in the environment object or process.env.
 * @example
 * const log = (str) => console.log(str);
 * const env = { "FOO": undefined, "BAR": "baz" };
 * process.env["FOO"] = "fooValue";
 * process.env["VOZ"] = "vozValue"; // not in `env`
 *
 * await addProcessEnv(log, env);
 * assert(env["FOO"] === "fooValue"); // true
 * assert(env["VOZ"] === undefined); // true, since it was not in `env`
 *
 * @example
 * const log = (str) => console.log(str);
 * const env = { "FOO": undefined, "BAR": "baz" };
 *
 * await addProcessEnv(log, env); // throws an error
 */
const addProcessEnv = async (
  log: (str: string) => void,
  env: typeof process.env
): Promise<void> => {
  let val;

  for (const key of Object.keys(env)) {
    if (typeof env[key] !== 'undefined') {
      continue;
    }

    val = process.env[key];

    if (typeof val === 'string') {
      log(
        `Reading ${chalk.bold(
          `"${chalk.bold(key)}"`
        )} from your env (as no value was specified)`
      );
      // Escape value if it begins with @
      env[key] = val.replace(/^@/, '\\@');
    } else {
      throw new Error(
        `No value specified for env variable ${chalk.bold(
          `"${chalk.bold(key)}"`
        )} and it was not found in your env. If you meant to specify an environment to deploy to, use ${param('--target')}`
      );
    }
  }
};
