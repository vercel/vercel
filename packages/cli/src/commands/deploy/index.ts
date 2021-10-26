import ms from 'ms';
import fs from 'fs-extra';
import bytes from 'bytes';
import chalk from 'chalk';
import { join, resolve, basename } from 'path';
import { Dictionary, fileNameSymbol, VercelConfig } from '@vercel/client';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import { readLocalConfig } from '../../util/config/files';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';
import Client from '../../util/client';
import { write as copy } from 'clipboardy';
import { getPrettyError } from '@vercel/build-utils';
import toHumanPath from '../../util/humanize-path';
import Now from '../../util';
import stamp from '../../util/output/stamp';
import createDeploy from '../../util/deploy/create-deploy';
import getDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host';
import parseMeta from '../../util/parse-meta';
import linkStyle from '../../util/output/link';
import param from '../../util/output/param';
import {
  BuildsRateLimited,
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
  DomainNotFound,
  DomainNotVerified,
  DomainPermissionDenied,
  DomainVerificationFailed,
  InvalidDomain,
  TooManyRequests,
  UserAborted,
  DeploymentsRateLimited,
  AliasDomainConfigured,
  MissingBuildScript,
  ConflictingFilePath,
  ConflictingPathSegment,
  BuildError,
  NotDomainOwner,
} from '../../util/errors-ts';
import { SchemaValidationFailed } from '../../util/errors';
import purchaseDomainIfAvailable from '../../util/domains/purchase-domain-if-available';
import confirm from '../../util/input/confirm';
import editProjectSettings from '../../util/input/edit-project-settings';
import {
  getLinkedProject,
  linkFolderToProject,
} from '../../util/projects/link';
import getProjectName from '../../util/get-project-name';
import selectOrg from '../../util/input/select-org';
import inputProject from '../../util/input/input-project';
import { prependEmoji, emoji } from '../../util/emoji';
import { inputRootDirectory } from '../../util/input/input-root-directory';
import validatePaths, {
  validateRootDirectory,
} from '../../util/validate-paths';
import { getCommandName } from '../../util/pkg-name';
import { getPreferredPreviewURL } from '../../util/deploy/get-preferred-preview-url';
import { Output } from '../../util/output';
import { help } from './args';

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
      '--prebuilt': Boolean,
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

  let localConfig = client.localConfig || readLocalConfig(paths[0]);

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

  const { log, debug, error, warn, isTTY } = output;

  const quiet = !isTTY;

  // check paths
  const pathValidation = await validatePaths(output, paths);

  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }

  const { isFile, path } = pathValidation;
  const autoConfirm = argv['--confirm'] || isFile;

  // deprecate --name
  if (argv['--name']) {
    output.print(
      `${prependEmoji(
        `The ${param(
          '--name'
        )} option is deprecated (https://vercel.link/name-flag)`,
        emoji('warning')
      )}\n`
    );
  }

  // retrieve `project` and `org` from .vercel
  const link = await getLinkedProject(client, path);

  if (link.status === 'error') {
    return link.exitCode;
  }

  let { org, project, status } = link;

  let newProjectName = null;
  let rootDirectory = project ? project.rootDirectory : null;
  let sourceFilesOutsideRootDirectory = true;

  if (status === 'not_linked') {
    const shouldStartSetup =
      autoConfirm ||
      (await confirm(
        `Set up and deploy ${chalk.cyan(`“${toHumanPath(path)}”`)}?`,
        true
      ));

    if (!shouldStartSetup) {
      output.print(`Aborted. Project not set up.\n`);
      return 0;
    }

    try {
      org = await selectOrg(
        client,
        'Which scope do you want to deploy to?',
        autoConfirm
      );
    } catch (err) {
      if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
        output.error(err.message);
        return 1;
      }

      throw err;
    }

    // We use `localConfig` here to read the name
    // even though the `vercel.json` file can change
    // afterwards, this is fine since the property
    // will be deprecated and can be replaced with
    // user input.
    const detectedProjectName = getProjectName({
      argv,
      nowConfig: localConfig || {},
      isFile,
      paths,
    });

    const projectOrNewProjectName = await inputProject(
      client,
      org,
      detectedProjectName,
      autoConfirm
    );

    if (typeof projectOrNewProjectName === 'string') {
      newProjectName = projectOrNewProjectName;
      rootDirectory = await inputRootDirectory(path, output, autoConfirm);
    } else {
      project = projectOrNewProjectName;
      rootDirectory = project.rootDirectory;
      sourceFilesOutsideRootDirectory = project.sourceFilesOutsideRootDirectory;

      // we can already link the project
      await linkFolderToProject(
        output,
        path,
        {
          projectId: project.id,
          orgId: org.id,
        },
        project.name,
        org.slug
      );
      status = 'linked';
    }
  }

  // At this point `org` should be populated
  if (!org) {
    throw new Error(`"org" is not defined`);
  }

  // Set the `contextName` and `currentTeam` as specified by the
  // Project Settings, so that API calls happen with the proper scope
  const contextName = org.slug;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  // if we have `sourceFilesOutsideRootDirectory` set to `true`, we use the current path
  // and upload the entire directory.
  const sourcePath =
    rootDirectory && !sourceFilesOutsideRootDirectory
      ? join(path, rootDirectory)
      : path;

  if (
    rootDirectory &&
    (await validateRootDirectory(
      output,
      path,
      sourcePath,
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
    const rootDirectoryConfig = readLocalConfig(join(path, rootDirectory));

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

  // build `env`
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

  // build `meta`
  const meta = Object.assign(
    {},
    parseMeta(localConfig.meta),
    parseMeta(argv['--meta'])
  );

  // Merge dotenv config, `env` from vercel.json, and `--env` / `-e` arguments
  const deploymentEnv = Object.assign(
    {},
    parseEnv(localConfig.env),
    parseEnv(argv['--env'])
  );

  // Merge build env out of  `build.env` from vercel.json, and `--build-env` args
  const deploymentBuildEnv = Object.assign(
    {},
    parseEnv(localConfig.build && localConfig.build.env),
    parseEnv(argv['--build-env'])
  );

  // If there's any undefined values, then inherit them from this process
  try {
    await addProcessEnv(log, deploymentEnv);
    await addProcessEnv(log, deploymentBuildEnv);
  } catch (err) {
    error(err.message);
    return 1;
  }

  // build `regions`
  const regionFlag = (argv['--regions'] || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  const regions = regionFlag.length > 0 ? regionFlag : localConfig.regions;

  // build `target`
  let target;
  if (argv['--target']) {
    const deprecatedTarget = argv['--target'];

    if (!['staging', 'production'].includes(deprecatedTarget)) {
      error(
        `The specified ${param('--target')} ${code(
          deprecatedTarget
        )} is not valid`
      );
      return 1;
    }

    if (deprecatedTarget === 'production') {
      warn(
        'We recommend using the much shorter `--prod` option instead of `--target production` (deprecated)'
      );
    }

    output.debug(`Setting target to ${deprecatedTarget}`);
    target = deprecatedTarget;
  } else if (argv['--prod']) {
    output.debug('Setting target to production');
    target = 'production';
  }

  const currentTeam = org?.type === 'team' ? org.id : undefined;
  const now = new Now({
    client,
    currentTeam,
  });
  let deployStamp = stamp();
  let deployment = null;

  try {
    const createArgs: any = {
      name: project ? project.name : newProjectName,
      env: deploymentEnv,
      build: { env: deploymentBuildEnv },
      forceNew: argv['--force'],
      withCache: argv['--with-cache'],
      prebuilt: argv['--prebuilt'],
      quiet,
      wantsPublic: argv['--public'] || localConfig.public,
      isFile,
      type: null,
      nowConfig: localConfig,
      regions,
      meta,
      deployStamp,
      target,
      skipAutoDetectionConfirmation: autoConfirm,
    };

    if (!localConfig.builds || localConfig.builds.length === 0) {
      // Only add projectSettings for zero config deployments
      createArgs.projectSettings = { sourceFilesOutsideRootDirectory };
    }

    deployment = await createDeploy(
      client,
      now,
      contextName,
      [sourcePath],
      createArgs,
      org,
      !project && !isFile,
      path
    );

    if (deployment.code === 'missing_project_settings') {
      let { projectSettings, framework } = deployment;
      if (rootDirectory) {
        projectSettings.rootDirectory = rootDirectory;
      }

      if (typeof sourceFilesOutsideRootDirectory !== 'undefined') {
        projectSettings.sourceFilesOutsideRootDirectory =
          sourceFilesOutsideRootDirectory;
      }

      const settings = await editProjectSettings(
        output,
        projectSettings,
        framework
      );

      // deploy again, but send projectSettings this time
      createArgs.projectSettings = settings;

      deployStamp = stamp();
      createArgs.deployStamp = deployStamp;
      deployment = await createDeploy(
        client,
        now,
        contextName,
        [sourcePath],
        createArgs,
        org,
        false,
        path
      );
    }

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

    const deploymentResponse = await getDeploymentByIdOrHost(
      client,
      contextName,
      deployment.id,
      'v10'
    );

    if (
      deploymentResponse instanceof DeploymentNotFound ||
      deploymentResponse instanceof DeploymentPermissionDenied ||
      deploymentResponse instanceof InvalidDeploymentId
    ) {
      output.error(deploymentResponse.message);
      return 1;
    }

    if (deployment === null) {
      error('Uploading failed. Please try again.');
      return 1;
    }
  } catch (err) {
    debug(`Error: ${err}\n${err.stack}`);

    if (err instanceof NotDomainOwner) {
      output.error(err.message);
      return 1;
    }

    if (err instanceof DomainNotFound && err.meta && err.meta.domain) {
      output.debug(
        `The domain ${err.meta.domain} was not found, trying to purchase it`
      );

      const purchase = await purchaseDomainIfAvailable(
        output,
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
        handleCreateDeployError(output, deployment, localConfig);
        return 1;
      }

      handleCreateDeployError(output, purchase, localConfig);
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
      handleCreateDeployError(output, err, localConfig);
      return 1;
    }

    if (err instanceof BuildError) {
      output.error(err.message || 'Build failed');
      output.error(
        `Check your logs at https://${now.url}/_logs or run ${getCommandName(
          `logs ${now.url}`
        )}`
      );

      return 1;
    }

    if (err.keyword === 'additionalProperties' && err.dataPath === '.scale') {
      const { additionalProperty = '' } = err.params || {};
      const message = `Invalid DC name for the scale option: ${additionalProperty}`;
      error(message);
    }

    if (err.code === 'size_limit_exceeded') {
      const { sizeLimit = 0 } = err;
      const message = `File size limit exceeded (${bytes(sizeLimit)})`;
      error(message);
      return 1;
    }

    handleError(err);
    return 1;
  }

  return printDeploymentStatus(
    output,
    client,
    deployment,
    deployStamp,
    !argv['--no-clipboard'],
    isFile
  );
};

function handleCreateDeployError(
  output: Output,
  error: Error,
  localConfig: VercelConfig
) {
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

const addProcessEnv = async (
  log: (str: string) => void,
  env: typeof process.env
) => {
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
        `No value specified for env ${chalk.bold(
          `"${chalk.bold(key)}"`
        )} and it was not found in your env.`
      );
    }
  }
};

const printDeploymentStatus = async (
  output: Output,
  client: Client,
  {
    readyState,
    alias: aliasList,
    aliasError,
    target,
    indications,
    url: deploymentUrl,
    aliasWarning,
  }: {
    readyState: string;
    alias: string[];
    aliasError: Error;
    target: string;
    indications: any;
    url: string;
    aliasWarning?: {
      code: string;
      message: string;
      link?: string;
      action?: string;
    };
  },
  deployStamp: () => string,
  isClipboardEnabled: boolean,
  isFile: boolean
) => {
  indications = indications || [];
  const isProdDeployment = target === 'production';

  if (readyState !== 'READY') {
    output.error(
      `Your deployment failed. Please retry later. More: https://err.sh/vercel/deployment-error`
    );
    return 1;
  }

  if (aliasError) {
    output.warn(
      `Failed to assign aliases${
        aliasError.message ? `: ${aliasError.message}` : ''
      }`
    );
  } else {
    // print preview/production url
    let previewUrl: string;
    let isWildcard: boolean;
    if (!isFile && Array.isArray(aliasList) && aliasList.length > 0) {
      const previewUrlInfo = await getPreferredPreviewURL(client, aliasList);
      if (previewUrlInfo) {
        isWildcard = previewUrlInfo.isWildcard;
        previewUrl = previewUrlInfo.previewUrl;
      } else {
        isWildcard = false;
        previewUrl = `https://${deploymentUrl}`;
      }
    } else {
      // fallback to deployment url
      isWildcard = false;
      previewUrl = `https://${deploymentUrl}`;
    }

    // copy to clipboard
    let isCopiedToClipboard = false;
    if (isClipboardEnabled && !isWildcard) {
      try {
        await copy(previewUrl);
        isCopiedToClipboard = true;
      } catch (err) {
        output.debug(`Error copyind to clipboard: ${err}`);
      }
    }

    output.print(
      prependEmoji(
        `${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
          previewUrl
        )}${
          isCopiedToClipboard ? chalk.gray(` [copied to clipboard]`) : ''
        } ${deployStamp()}`,
        emoji('success')
      ) + `\n`
    );
  }

  if (aliasWarning?.message) {
    indications.push({
      type: 'warning',
      payload: aliasWarning.message,
      link: aliasWarning.link,
      action: aliasWarning.action,
    });
  }

  const newline = '\n';
  for (let indication of indications) {
    const message =
      prependEmoji(chalk.dim(indication.payload), emoji(indication.type)) +
      newline;
    let link = '';
    if (indication.link)
      link =
        chalk.dim(
          `${indication.action || 'Learn More'}: ${linkStyle(indication.link)}`
        ) + newline;
    output.print(message + link);
  }
};

// Converts `env` Arrays, Strings and Objects into env Objects.
const parseEnv = (env?: string[] | Dictionary<string>) => {
  if (!env) {
    return {};
  }

  if (typeof env === 'string') {
    // a single `--env` arg comes in as a String
    env = [env];
  }

  if (Array.isArray(env)) {
    return env.reduce((o, e) => {
      let key;
      let value;
      const equalsSign = e.indexOf('=');

      if (equalsSign === -1) {
        key = e;
      } else {
        key = e.substr(0, equalsSign);
        value = e.substr(equalsSign + 1);
      }

      o[key] = value;
      return o;
    }, {} as Dictionary<string | undefined>);
  }

  // assume it's already an Object
  return env;
};
