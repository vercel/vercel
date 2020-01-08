import ms from 'ms';
import bytes from 'bytes';
import { write as copy } from 'clipboardy';
import chalk from 'chalk';
import title from 'title';
import Client from '../../util/client';
import { handleError } from '../../util/error';
import getArgs from '../../util/get-args';
import toHumanPath from '../../util/humanize-path';
import Now from '../../util';
import stamp from '../../util/output/stamp.ts';
import createDeploy from '../../util/deploy/create-deploy';
import getDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host';
import parseMeta from '../../util/parse-meta';
import code from '../../util/output/code';
import param from '../../util/output/param';
import highlight from '../../util/output/highlight';
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
import isWildcardAlias from '../../util/alias/is-wildcard-alias';
import shouldDeployDir from '../../util/deploy/should-deploy-dir';
import promptBool from '../../util/input/prompt-bool';
import selectProject from '../../util/input/select-project';
import editProjectSettings from '../../util/input/edit-project-settings';
import {
  getLinkedProject,
  linkFolderToProject,
} from '../../util/projects/link';

const addProcessEnv = async (log, env) => {
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
  output,
  { readyState, alias: aliasList, aliasError, target },
  deployStamp,
  isClipboardEnabled,
  orgName,
  project
) => {
  const isFirstDeployment =
    project && project.targets && !project.targets.production;
  const isProdDeployment = target === 'production';

  if (readyState !== 'READY') {
    output.error(
      `Your deployment failed. Please retry later. More: https://err.sh/now/deployment-error`
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
    if (Array.isArray(aliasList) && aliasList.length > 0) {
      // search for a non now.sh/non wildcard domain
      // but fallback to the first alias in the list
      const mainAlias =
        aliasList.find(
          alias => !alias.endsWith('.now.sh') && !isWildcardAlias(alias)
        ) || aliasList[0];

      const prodUrl = isWildcardAlias(mainAlias)
        ? mainAlias
        : `https://${mainAlias}`;

      // copy to clipboard
      let isCopiedToClipboard = false;
      if (isClipboardEnabled && !isWildcardAlias(mainAlias)) {
        await copy(prodUrl)
          .then(() => (isCopiedToClipboard = true))
          .catch(error => output.debug(`Error copying to clipboard: ${error}`));
      }

      output.print(
        `✅  ${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
          prodUrl
        )} ${
          isCopiedToClipboard ? chalk.gray('[in clipboard]') : ''
        } ${deployStamp()}\n`
      );
    } else {
      output.print(`Deployment complete ${deployStamp()}\n`);
    }
  }

  if (!isProdDeployment) {
    // add the production domain(s) there 👇
    output.print(
      `ℹ️  ${chalk.grey(`To deploy to production run ${'`now --prod`'}`)}\n`
    );
  }

  if (isFirstDeployment && isProdDeployment) {
    // add a docs url there 👇
    output.print(
      `ℹ️  ${chalk.grey(
        `Deployed to production. Run ${'`now --prod`'} to overwrite later.`
      )}\n`
    );
    output.print(
      `💡  ${chalk.grey(
        `To set a custom production domain, go to https://zeit.co/${orgName}/${project.name}/domains`
      )}\n`
    );
  }

  return 0;
};

// Converts `env` Arrays, Strings and Objects into env Objects.
const parseEnv = env => {
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
    }, {});
  }
  // assume it's already an Object
  return env;
};

export default async function main(
  ctx,
  contextName,
  output,
  stats,
  localConfig,
  isFile,
  args
) {
  let argv = null;

  try {
    argv = getArgs(ctx.argv.slice(2), args);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (!(await shouldDeployDir(argv._[0], output))) {
    return 0;
  }

  const {
    apiUrl,
    authConfig: { token },
    config: { currentTeam },
  } = ctx;
  const { log, debug, error, warn } = output;
  const paths = Object.keys(stats);
  const debugEnabled = argv['--debug'];

  // $FlowFixMe
  const isTTY = process.stdout.isTTY;
  const quiet = !isTTY;

  // check paths
  if (paths.length > 1) {
    output.error(`${chalk.red('Error!')} Can't deploy more than one path.`);
    return 1;
  }

  // build `meta`
  const meta = Object.assign(
    {},
    parseMeta(localConfig.meta),
    parseMeta(argv['--meta'])
  );

  // --no-scale
  if (argv['--no-scale']) {
    warn(`The option --no-scale is only supported on Now 1.0 deployments`);
  }

  // build `env`
  const isObject = item =>
    Object.prototype.toString.call(item) === '[object Object]';

  // This validation needs to happen on the client side because
  // the data is merged with other data before it is passed to the API (which
  // also does schema validation).
  if (typeof localConfig.env !== 'undefined' && !isObject(localConfig.env)) {
    error(
      `The ${code('env')} property in ${highlight(
        'now.json'
      )} needs to be an object`
    );
    return 1;
  }

  if (typeof localConfig.build !== 'undefined') {
    if (!isObject(localConfig.build)) {
      error(
        `The ${code('build')} property in ${highlight(
          'now.json'
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
          'now.json'
        )} needs to be an object`
      );
      return 1;
    }
  }

  // Merge dotenv config, `env` from now.json, and `--env` / `-e` arguments
  const deploymentEnv = Object.assign(
    {},
    parseEnv(localConfig.env),
    parseEnv(argv['--env'])
  );

  // Merge build env out of  `build.env` from now.json, and `--build-env` args
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
    .map(s => s.trim())
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

  // retrieve `project` and `org` from .now
  const client = new Client({
    apiUrl: ctx.apiUrl,
    token: ctx.authConfig.token,
    currentTeam: ctx.config.currentTeam,
    debug: debugEnabled,
  });

  const path = paths[0];
  let [orgName, project] = await getLinkedProject(client);

  console.log(orgName, project ? project.name : 'no project');

  if (!project) {
    const shouldStartSetup = await promptBool(
      `Set up and deploy ${chalk.cyan(`“${toHumanPath(path)}”`)}? [Y/n]`
    );

    if (!shouldStartSetup) {
      output.print(`Aborted. Project not set up.\n`);
      return 0;
    }

    const shouldLinkToProject = await promptBool(
      `Link to an existing ZEIT Now project? [y/N]`
    );

    if (shouldLinkToProject) {
      project = await selectProject(output, client, ctx.config.currentTeam);

      await linkFolderToProject(output, {
        projectId: project.id,
        orgId: project.accountId,
      });
    } else {
      // later, we'll ask the directory here
    }
  }

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });
  let deployStamp = stamp();
  let deployment = null;

  try {
    const createArgs = {
      name: project ? project.name : null,
      env: deploymentEnv,
      build: { env: deploymentBuildEnv },
      forceNew: argv['--force'],
      quiet,
      wantsPublic: argv['--public'] || localConfig.public,
      isFile,
      type: null,
      nowConfig: localConfig,
      regions,
      meta,
      deployStamp,
      target,
    };

    deployment = await createDeploy(
      output,
      now,
      contextName,
      [path],
      createArgs,
      orgName,
      project ? project.name : null
    );

    if (
      deployment instanceof Error &&
      deployment.code === 'missing_project_settings'
    ) {
      let { projectSettings, framework } = deployment;

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
        output,
        now,
        contextName,
        [path],
        createArgs,
        orgName,
        project ? project.name : null
      );

      await linkFolderToProject(output, {
        projectId: deployment.projectId,
        orgId: deployment.ownerId,
      });
    }

    if (deployment instanceof NotDomainOwner) {
      output.error(deployment);
      return 1;
    }

    const deploymentResponse = await getDeploymentByIdOrHost(
      now,
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
        new Client({
          apiUrl: ctx.apiUrl,
          token: ctx.authConfig.token,
          currentTeam: ctx.config.currentTeam,
          debug: debugEnabled,
        }),
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
        handleCreateDeployError(output, deployment);
        return 1;
      }

      handleCreateDeployError(output, purchase);
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
      handleCreateDeployError(output, err);
      return 1;
    }

    if (err instanceof BuildError) {
      output.error('Build failed');
      output.error(
        `Check your logs at ${now.url}/_logs or run ${code(
          `now logs ${now.url}`
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
    deployment,
    deployStamp,
    !argv['--no-clipboard'],
    orgName,
    project
  );
}

function handleCreateDeployError(output, error) {
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
    const { message, params, keyword, dataPath } = error.meta;

    if (params && params.additionalProperty) {
      const prop = params.additionalProperty;

      output.error(
        `The property ${code(prop)} is not allowed in ${highlight(
          'now.json'
        )} when using Now 2.0 – please remove it.`
      );

      if (prop === 'build.env' || prop === 'builds.env') {
        output.note(
          `Do you mean ${code('build')} (object) with a property ${code(
            'env'
          )} (object) instead of ${code(prop)}?`
        );
      }

      return 1;
    }

    if (keyword === 'type') {
      const prop = dataPath.substr(1, dataPath.length);

      output.error(
        `The property ${code(prop)} in ${highlight(
          'now.json'
        )} can only be of type ${code(title(params.type))}.`
      );

      return 1;
    }

    const link = 'https://zeit.co/docs/v2/deployments/configuration/';

    output.error(
      `Failed to validate ${highlight(
        'now.json'
      )}: ${message}\nDocumentation: ${link}`
    );

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
    output.note(`Run ${code('now upgrade')} to increase your builds limit.`);
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
