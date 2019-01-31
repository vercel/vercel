import ms from 'ms';
import bytes from 'bytes';
import { write as copy } from 'clipboardy';
import chalk from 'chalk';
import title from 'title';
import Progress from 'progress';
import eraseLines from '../../util/output/erase-lines';
import wait from '../../util/output/wait';
import { handleError } from '../../util/error';
import getArgs from '../../util/get-args';
import toHumanPath from '../../util/humanize-path';
import Now from '../../util';
import stamp from '../../util/output/stamp.ts';
import buildsList from '../../util/output/builds';
import { isReady, isDone, isFailed } from '../../util/build-state';
import createDeploy from '../../util/deploy/create-deploy';
import dnsTable from '../../util/format-dns-table.ts';
import sleep from '../../util/sleep';
import parseMeta from '../../util/parse-meta';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import getProjectName from '../../util/get-project-name';
import {
  WildcardNotAllowed,
  CantSolveChallenge,
  DomainConfigurationError,
  DomainNotFound,
  DomainPermissionDenied,
  DomainsShouldShareRoot,
  DomainValidationRunning,
  DomainVerificationFailed,
  TooManyCertificates,
  TooManyRequests
} from '../../util/errors-ts';
import { SchemaValidationFailed } from '../../util/errors';

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

const deploymentErrorMsg = `Your deployment failed. Please retry later. More: https://err.sh/now-cli/deployment-error`;

const printDeploymentStatus = (
  output,
  { url, readyState },
  deployStamp,
  builds
) => {
  if (readyState === 'READY') {
    output.success(`Deployment ready ${deployStamp()}`);
    return 0;
  }

  if (!builds) {
    output.error(deploymentErrorMsg);
    return 1;
  }

  const failedBuils = builds.filter(isFailed);
  const amount = failedBuils.length;

  if (amount > 0) {
    const name = amount === 1 ? 'failure' : 'failures';

    output.error(`${amount} build ${name} occured.`);
    output.error(
      `Check your logs at https://${url}/_logs or run ${code(
        `now logs ${url}`
      )}.`
    );

    return 1;
  }

  output.error(deploymentErrorMsg);
  return 1;
};

const renderBuilds = (print, list, times, linesPrinted) => {
  if (linesPrinted !== null) {
    print(eraseLines(linesPrinted));
  }

  const { lines, toPrint } = buildsList(list, times, false);
  print(toPrint);

  return lines;
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

  const { apiUrl, authConfig: { token }, config: { currentTeam } } = ctx;
  const { log, debug, error, print } = output;
  const paths = Object.keys(stats);
  const debugEnabled = argv['--debug'];

  // $FlowFixMe
  const isTTY = process.stdout.isTTY;
  const quiet = !isTTY;

  const list = paths
    .map((path, index) => {
      let suffix = '';

      if (paths.length > 1 && index !== paths.length - 1) {
        suffix = index < paths.length - 2 ? ', ' : ' and ';
      }

      return chalk.bold(toHumanPath(path)) + suffix;
    })
    .join('');

  log(`Deploying ${list} under ${chalk.bold(contextName)}`);

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });
  const meta = Object.assign(
    {},
    parseMeta(localConfig.meta),
    parseMeta(argv['--meta'])
  );

  let syncCount;
  let deployStamp = stamp();
  let deployment = null;


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

  const regionFlag = (argv['--regions'] || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const regions = regionFlag.length > 0 ? regionFlag : localConfig.regions;

  try {
    // $FlowFixMe
    const project = getProjectName({argv, nowConfig: localConfig, isFile, paths});
    log(`Using project ${chalk.bold(project)}`);
    const createArgs = Object.assign(
      {
        env: deploymentEnv,
        build: { env: deploymentBuildEnv },
        forceNew: argv['--force'],
        quiet,
        wantsPublic: argv['--public'] || localConfig.public,
        isFile,
        type: null,
        nowConfig: localConfig,
        regions,
        meta
      },
      {
        name: project
      }
    );

    deployStamp = stamp();

    const firstDeployCall = await createDeploy(
      output,
      now,
      contextName,
      paths,
      createArgs
    );

    if (
      firstDeployCall instanceof WildcardNotAllowed ||
      firstDeployCall instanceof CantSolveChallenge ||
      firstDeployCall instanceof DomainConfigurationError ||
      firstDeployCall instanceof DomainNotFound ||
      firstDeployCall instanceof DomainPermissionDenied ||
      firstDeployCall instanceof DomainsShouldShareRoot ||
      firstDeployCall instanceof DomainValidationRunning ||
      firstDeployCall instanceof DomainVerificationFailed ||
      firstDeployCall instanceof SchemaValidationFailed ||
      firstDeployCall instanceof TooManyCertificates ||
      firstDeployCall instanceof TooManyRequests
    ) {
      handleCreateDeployError(output, firstDeployCall);
      return 1;
    }

    deployment = firstDeployCall;

    if (now.syncFileCount > 0) {
      const uploadStamp = stamp();

      await new Promise((resolve, reject) => {
        if (now.syncFileCount !== now.fileCount) {
          debug(`Total files ${now.fileCount}, ${now.syncFileCount} changed`);
        }

        const size = bytes(now.syncAmount);
        syncCount = `${now.syncFileCount} file${now.syncFileCount > 1
          ? 's'
          : ''}`;
        const bar = new Progress(
          `${chalk.gray(
            '>'
          )} Upload [:bar] :percent :etas (${size}) [${syncCount}]`,
          {
            width: 20,
            complete: '=',
            incomplete: '',
            total: now.syncAmount,
            clear: true
          }
        );

        now.upload({ scale: {} });

        now.on('upload', ({ names, data }) => {
          debug(`Uploaded: ${names.join(' ')} (${bytes(data.length)})`);
        });

        now.on('uploadProgress', progress => {
          bar.tick(progress);
        });

        now.on('complete', resolve);

        now.on('error', err => {
          error('Upload failed');
          reject(err);
        });
      });

      if (!quiet && syncCount) {
        log(`Synced ${syncCount} (${bytes(now.syncAmount)}) ${uploadStamp()}`);
      }

      for (let i = 0; i < 4; i += 1) {
        deployStamp = stamp();
        const secondDeployCall = await createDeploy(
          output,
          now,
          contextName,
          paths,
          createArgs
        );
        if (
          secondDeployCall instanceof WildcardNotAllowed ||
          secondDeployCall instanceof CantSolveChallenge ||
          secondDeployCall instanceof DomainConfigurationError ||
          secondDeployCall instanceof DomainNotFound ||
          secondDeployCall instanceof DomainPermissionDenied ||
          secondDeployCall instanceof DomainsShouldShareRoot ||
          secondDeployCall instanceof DomainValidationRunning ||
          secondDeployCall instanceof DomainVerificationFailed ||
          secondDeployCall instanceof SchemaValidationFailed ||
          secondDeployCall instanceof TooManyCertificates ||
          secondDeployCall instanceof TooManyRequests
        ) {
          handleCreateDeployError(output, secondDeployCall);
          return 1;
        }

        if (now.syncFileCount === 0) {
          deployment = secondDeployCall;
          break;
        }
      }

      if (deployment === null) {
        error('Uploading failed. Please try again.');
        return 1;
      }
    }
  } catch (err) {
    debug(`Error: ${err}\n${err.stack}`);

    if (err.keyword === 'additionalProperties' && err.dataPath === '.scale') {
      const { additionalProperty = '' } = err.params || {};
      const message = `Invalid DC name for the scale option: ${additionalProperty}`;
      error(message);
    }

    handleError(err);
    return 1;
  }

  const { url } = now;

  if (isTTY) {
    if (!argv['--no-clipboard']) {
      try {
        await copy(url);
        log(
          `${chalk.bold(chalk.cyan(url))} ${chalk.gray(`[v2]`)} ${chalk.gray(
            '[in clipboard]'
          )} ${deployStamp()}`
        );
      } catch (err) {
        debug(`Error copying to clipboard: ${err}`);
        log(
          `${chalk.bold(chalk.cyan(url))} ${chalk.gray(`[v2]`)} ${deployStamp()}`
        );
      }
    } else {
      log(`${chalk.bold(chalk.cyan(url))} ${deployStamp()}`);
    }
  } else {
    process.stdout.write(url);
  }

  // If an error occured, we want to let it fall down to rendering
  // builds so the user can see in which build the error occured.
  if (isReady(deployment)) {
    return printDeploymentStatus(output, deployment, deployStamp);
  }

  const sleepingTime = ms('1.5s');
  const allBuildsTime = stamp();
  const times = {};
  const buildsUrl = `/v1/now/deployments/${deployment.id}/builds`;
  const deploymentUrl = `/v6/now/deployments/${deployment.id}`;

  let builds = [];
  let buildsCompleted = false;

  let deploymentSpinner = null;
  let linesPrinted = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!buildsCompleted) {
      const { builds: freshBuilds } = await now.fetch(buildsUrl);

      for (const build of freshBuilds) {
        const id = build.id;
        const done = isDone(build);

        if (times[id]) {
          if (done && typeof times[id] === 'function') {
            times[id] = times[id]();
          }
        } else {
          times[id] = done ? allBuildsTime() : stamp();
        }
      }

      if (JSON.stringify(builds) !== JSON.stringify(freshBuilds)) {
        builds = freshBuilds;

        debug(`Re-rendering builds, because their state changed.`);

        linesPrinted = renderBuilds(print, builds, times, linesPrinted);
        buildsCompleted = builds.every(isDone);

        if (builds.some(isFailed)) {
          break;
        }
      } else {
        debug(`Not re-rendering, as the build states did not change.`);
      }
    }

    if (buildsCompleted) {
      const deploymentResponse = await now.fetch(deploymentUrl);

      if (isDone(deploymentResponse)) {
        deployment = deploymentResponse;

        if (typeof deploymentSpinner === 'function') {
          // This stops it
          deploymentSpinner();
        }

        break;
      } else if (!deploymentSpinner) {
        deploymentSpinner = wait('Waiting for deployment to be ready');
      }
    }

    await sleep(sleepingTime);
  }

  return printDeploymentStatus(output, deployment, deployStamp, builds);
};

function handleCreateDeployError(output, error) {
  if (error instanceof WildcardNotAllowed) {
    output.error(
      `Custom suffixes are only allowed for domains in ${chalk.underline(
        'zeit.world'
      )}`
    );
    return 1;
  }
  if (error instanceof CantSolveChallenge) {
    if (error.meta.type === 'dns-01') {
      output.error(
        `The certificate provider could not resolve the DNS queries for ${error
          .meta.domain}.`
      );
      output.print(
        `  This might happen to new domains or domains with recent DNS changes. Please retry later.\n`
      );
    } else {
      output.error(
        `The certificate provider could not resolve the HTTP queries for ${error
          .meta.domain}.`
      );
      output.print(
        `  The DNS propagation may take a few minutes, please verify your settings:\n\n`
      );
      output.print(`${dnsTable([['', 'ALIAS', 'alias.zeit.co']])}\n`);
    }
    return 1;
  }
  if (error instanceof DomainConfigurationError) {
    output.error(
      `We couldn't verify the propagation of the DNS settings for ${chalk.underline(
        error.meta.domain
      )}`
    );
    if (error.meta.external) {
      output.print(
        `  The propagation may take a few minutes, but please verify your settings:\n\n`
      );
      output.print(
        `${dnsTable([
          error.meta.subdomain === null
            ? ['', 'ALIAS', 'alias.zeit.co']
            : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
        ])}\n`
      );
    } else {
      output.print(
        `  We configured them for you, but the propagation may take a few minutes.\n`
      );
      output.print(`  Please try again later.\n`);
    }
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
  if (error instanceof DomainsShouldShareRoot) {
    output.error(`All given common names should share the same root domain.`);
    return 1;
  }
  if (error instanceof DomainValidationRunning) {
    output.error(
      `There is a validation in course for ${chalk.underline(
        error.meta.domain
      )}. Wait until it finishes.`
    );
    return 1;
  }
  if (error instanceof SchemaValidationFailed) {
    const { params, keyword, dataPath } = error.meta;
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
      )}. Only use properties mentioned here: ${link}`
    );
    return 1;
  }
  if (error instanceof TooManyCertificates) {
    output.error(
      `Too many certificates already issued for exact set of domains: ${error.meta.domains.join(
        ', '
      )}`
    );
    return 1;
  }
  if (error instanceof TooManyRequests) {
    output.error(
      `Too many requests detected for ${error.meta
        .api} API. Try again in ${ms(error.meta.retryAfter * 1000, {
        long: true
      })}.`
    );
    return 1;
  }
  if (error instanceof DomainNotFound) {
    output.error(
      `The domain used as a suffix ${chalk.underline(
        error.meta.domain
      )} no longer exists. Please update or remove your custom suffix.`
    );
    return 1;
  }

  return error;
}
