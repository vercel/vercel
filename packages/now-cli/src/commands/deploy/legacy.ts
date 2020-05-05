import { resolve, basename } from 'path';
import { eraseLines } from 'ansi-escapes';
// @ts-ignore
import { write as copy } from 'clipboardy';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs-extra';
// @ts-ignore
import inquirer from 'inquirer';
import mri from 'mri';
import ms from 'ms';
// @ts-ignore
import title from 'title';
import plural from 'pluralize';
// @ts-ignore
import { handleError } from '../../util/error';
import chars from '../../util/output/chars';
// @ts-ignore
import checkPath from '../../util/check-path';
import cmd from '../../util/output/cmd';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import link from '../../util/output/link';
// @ts-ignore
import exit from '../../util/exit';
// @ts-ignore
import Now from '../../util';
import uniq from '../../util/unique-strings';
import promptBool from '../../util/input/prompt-bool';
// @ts-ignore
import promptOptions from '../../util/prompt-options';
// @ts-ignore
import readMetaData from '../../util/read-metadata';
import toHumanPath from '../../util/humanize-path';
// @ts-ignore
import createDeploy from '../../util/deploy/create-deploy';
import eventListenerToGenerator from '../../util/event-listener-to-generator';
// @ts-ignore
import formatLogOutput from '../../util/output/format-log-output';
// @ts-ignore
import getEventsStream from '../../util/deploy/get-events-stream';
import shouldDeployDir from '../../util/deploy/should-deploy-dir';
// @ts-ignore
import getInstanceIndex from '../../util/deploy/get-instance-index';
import joinWords from '../../util/output/join-words';
// @ts-ignore
import normalizeRegionsList from '../../util/scale/normalize-regions-list';
import raceAsyncGenerators from '../../util/race-async-generators';
// @ts-ignore
import regionOrDCToDc from '../../util/scale/region-or-dc-to-dc';
import stamp from '../../util/output/stamp';
import verifyDeploymentScale from '../../util/scale/verify-deployment-scale';
// @ts-ignore
import parseMeta from '../../util/parse-meta';
// @ts-ignore
import getProjectName from '../../util/get-project-name';
import { Output } from '../../util/output';
import {
  DeploymentNotFound,
  DomainNotFound,
  DomainPermissionDenied,
  DomainVerificationFailed,
  TooManyRequests,
  VerifyScaleTimeout,
  DeploymentsRateLimited,
  NotDomainOwner,
} from '../../util/errors-ts';
import {
  InvalidAllForScale,
  SchemaValidationFailed,
  InvalidRegionOrDCForScale,
} from '../../util/errors';

interface Env {
  [name: string]: string | null | undefined;
}

interface DcScale {
  [dcId: string]: { min: number; max: number };
}

interface SyncOptions {
  contextName: string;
  output: any;
  token: string;
  config: { currentTeam?: string };
  firstRun: boolean;
  deploymentType?: string;
}

let argv: any;
let paths: string[];

// Options
let forceNew: boolean;
let withCache: boolean;
let deploymentName: string;
let sessionAffinity: string;
let log: any;
let error: any;
let warn: any;
let debug: any;
let note: any;
let debugEnabled: boolean;
let clipboard: boolean;
let forwardNpm: boolean;
let followSymlinks: boolean;
let wantsPublic: boolean;
let regions: string[];
let noScale: boolean;
let noVerify: boolean;
let apiUrl: string;
let isTTY: boolean;
let quiet: boolean;

// If the current deployment is a repo
const gitRepo: any = {};

// For `env` and `buildEnv`
const getNullFields = (o: Env) => Object.keys(o).filter(k => o[k] === null);

const addProcessEnv = async (env: Env) => {
  let val;
  for (const key of Object.keys(env)) {
    if (typeof env[key] !== 'undefined') continue;
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
      error(
        `No value specified for env ${chalk.bold(
          `"${chalk.bold(key)}"`
        )} and it was not found in your env.`
      );
      await exit(1);
      return;
    }
  }
};

const stopDeployment = async (msg: string) => {
  handleError(msg);
  await exit(1);
};

// Converts `env` Arrays, Strings and Objects into env Objects.
// `null` empty value means to prompt user for value upon deployment.
// `undefined` empty value means to inherit value from user's env.
const parseEnv = (
  env: string | string[] | Env | undefined,
  empty: null | undefined
) => {
  if (!env) {
    return {};
  }
  if (typeof env === 'string') {
    // a single `--env` arg comes in as a String
    env = [env];
  }
  if (Array.isArray(env)) {
    return env.reduce((o: Env, e: string) => {
      let key;
      let value;
      const equalsSign = e.indexOf('=');
      if (equalsSign === -1) {
        key = e;
        value = empty;
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

const promptForEnvFields = async (list: string[]) => {
  if (list.length === 0) {
    return {};
  }

  const questions = [];

  for (const field of list) {
    questions.push({
      name: field,
      message: field,
    });
  }

  require('../../util/input/patch-inquirer-legacy');

  log('Please enter values for the following environment variables:');
  const answers = await inquirer.prompt(questions);

  for (const answer of Object.keys(answers)) {
    const content = answers[answer];

    if (content === '') {
      await stopDeployment(`Enter a value for ${answer}`);
    }
  }

  return answers;
};

export default async function main(
  ctx: any,
  contextName: string,
  output: Output,
  mriOpts: any
) {
  argv = mri(ctx.argv.slice(2), mriOpts);

  if (argv._[0] === 'deploy') {
    argv._.shift();
  }

  if (argv._.length > 0) {
    // If path is relative: resolve
    // if path is absolute: clear up strange `/` etc
    paths = argv._.map((item: string) => resolve(process.cwd(), item));
  } else {
    paths = [process.cwd()];
  }

  if (!(await shouldDeployDir(argv._[0], output))) {
    return 0;
  }

  // Options
  forceNew = argv.force;
  withCache = argv['with-cache'];
  deploymentName = argv.name;
  sessionAffinity = argv['session-affinity'];
  debugEnabled = argv.debug;
  clipboard = argv.clipboard && !argv.C;
  forwardNpm = argv['forward-npm'];
  followSymlinks = !argv.links;
  wantsPublic = argv.public;
  regions = (argv.regions || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  noVerify = argv.verify === false;
  noScale = argv.scale === false;
  apiUrl = ctx.apiUrl;
  // https://github.com/facebook/flow/issues/1825
  isTTY = Boolean(process.stdout.isTTY);
  quiet = !isTTY;
  ({ log, error, note, debug, warn } = output);

  const infoUrl = 'https://vercel.com/guides/migrate-to-vercel';

  warn(
    `You are using an old version of the Now Platform. More: ${link(infoUrl)}`
  );

  if (argv.prod || argv.target) {
    error(
      `The option ${cmd(
        argv.prod ? '--prod' : '--target'
      )} is not supported for Now 1.0 deployments. To manually alias a deployment, use ${cmd(
        'now alias'
      )} instead.`
    );
    await exit(1);
    return 1;
  }

  const {
    authConfig: { token },
    config,
  } = ctx;

  try {
    return await sync({
      contextName,
      output,
      token,
      config,
      firstRun: true,
      deploymentType: undefined,
    });
  } catch (err) {
    await stopDeployment(err);
  }
}

async function sync({
  contextName,
  output,
  token,
  config: { currentTeam },
  firstRun,
  deploymentType,
}: SyncOptions): Promise<void> {
  return new Promise(async (_resolve, reject) => {
    let deployStamp = stamp();
    const rawPath = argv._[0];

    let meta;
    let deployment = null;
    let isFile;

    if (paths.length === 1) {
      try {
        const fsData = await fs.lstat(paths[0]);

        if (fsData.isFile()) {
          isFile = true;
          deploymentType = 'static';
        }
      } catch (err) {
        let repo;
        let isValidRepo = false;

        const { fromGit, isRepoPath, gitPathParts } = require('../../util/git');

        try {
          isValidRepo = isRepoPath(rawPath);
        } catch (_err) {
          if (err.code === 'INVALID_URL') {
            await stopDeployment(_err);
          } else {
            reject(_err);
          }
        }

        if (isValidRepo) {
          const gitParts = gitPathParts(rawPath);
          Object.assign(gitRepo, gitParts);

          const searchMessage = setTimeout(() => {
            log(`Didn't find directory. Searching on ${gitRepo.type}...`);
          }, 500);

          try {
            repo = await fromGit(rawPath, debugEnabled);
          } catch (err) {}

          clearTimeout(searchMessage);
        }

        if (repo) {
          // Tell now which directory to deploy
          paths = [repo.path];

          // Set global variable for deleting tmp dir later
          // once the deployment has finished
          Object.assign(gitRepo, repo);
        } else if (isValidRepo) {
          const gitRef = gitRepo.ref
            ? `with "${chalk.bold(gitRepo.ref)}" `
            : '';

          await stopDeployment(
            `There's no repository named "${chalk.bold(
              gitRepo.main
            )}" ${gitRef}on ${gitRepo.type}`
          );
        } else {
          error(
            `The specified directory "${basename(paths[0])}" doesn't exist.`
          );
          await exit(1);
        }
      }
    } else {
      isFile = false;
      deploymentType = 'static';
    }

    const checkers = [];

    if (isFile || (!isFile && paths.length === 1)) {
      checkers.push(checkPath(paths[0]));
    } else {
      for (const path of paths) {
        const fsData = await fs.lstat(path);

        if (fsData.isFile()) {
          continue;
        }

        checkers.push(checkPath(path));
      }
    }

    try {
      await Promise.all(checkers);
    } catch (err) {
      error(err.message, 'path-not-deployable');
      await exit(1);
    }

    if (!quiet && firstRun) {
      if (gitRepo.main) {
        const gitRef = gitRepo.ref ? ` at "${chalk.bold(gitRepo.ref)}" ` : '';

        log(
          `Deploying ${gitRepo.type} repository "${chalk.bold(
            gitRepo.main
          )}"${gitRef} under ${chalk.bold(contextName)}`
        );
      } else {
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
      }
    }

    if (!isFile && deploymentType !== 'static') {
      if (argv.docker) {
        debug(`Forcing \`deploymentType\` = \`docker\``);
        deploymentType = 'docker';
      } else if (argv.npm) {
        debug(`Forcing \`deploymentType\` = \`npm\``);
        deploymentType = 'npm';
      } else if (argv.static) {
        debug(`Forcing \`deploymentType\` = \`static\``);
        deploymentType = 'static';
      }
    } else if (deploymentType === 'static') {
      debug(`Forcing \`deploymentType\` = \`static\` automatically`);

      meta = {
        type: deploymentType,
        pkg: undefined,
        nowConfig: undefined,
        hasNowJson: false,

        // XXX: legacy
        deploymentType,
        sessionAffinity,
      };
    }

    if (!meta) {
      try {
        ({
          meta,
          deploymentName,
          deploymentType,
          sessionAffinity,
        } = await readMeta(
          paths[0],
          deploymentName,
          deploymentType,
          sessionAffinity
        ));
      } catch (err) {
        const print = [
          'config_prop_and_file',
          'dockerfile_missing',
          'no_dockerfile_commands',
          'unsupported_deployment_type',
          'multiple_manifests',
        ];

        if (
          (err.code && print.includes(err.code)) ||
          err.name === 'JSONError'
        ) {
          error(err.message);
          return 1;
        }

        throw err;
      }
    }

    const nowConfig = meta.nowConfig || {};
    const scaleFromConfig = getScaleFromConfig(nowConfig);

    let scale: DcScale = {};
    let dcIds: any;

    // If there are regions coming from the args and now.json warn about it
    if (regions.length > 0 && getRegionsFromConfig(nowConfig).length > 0) {
      warn(
        `You have regions defined from both args and now.json, using ${chalk.bold(
          regions.join(',')
        )}`
      );
    }

    // If there are no regions from args, use config
    if (regions.length === 0) {
      regions = getRegionsFromConfig(nowConfig);
    }

    // Read scale and fail if we have both regions and scale
    if (regions.length > 0 && Object.keys(scaleFromConfig).length > 0) {
      error(
        "Can't set both `regions` and `scale` options simultaneously",
        'regions-and-scale-at-once'
      );
      await exit(1);
    }

    // If we have a regions list we use it to build scale presets
    if (regions.length > 0) {
      dcIds = normalizeRegionsList(regions);
      if (dcIds instanceof InvalidRegionOrDCForScale) {
        error(
          `The value "${dcIds.meta.regionOrDC}" is not a valid region or DC identifier`
        );
        await exit(1);
        return 1;
      }
      if (dcIds instanceof InvalidAllForScale) {
        error(`You can't use all in the regions list mixed with other regions`);
        await exit(1);
        return 1;
      }

      // Build the scale presets based on the given regions
      scale = dcIds.reduce(
        (result: DcScale, dcId: string) => ({
          ...result,
          [dcId]: { min: 0, max: 1 },
        }),
        {}
      );
    } else if (noScale) {
      debug(`Option --no-scale was set. Skipping scale parameters`);
      scale = {};
    } else if (Object.keys(scaleFromConfig).length > 0) {
      // If we have no regions list we get it from the scale keys but we have to validate
      // them becase we don't admin `all` in this scenario. Also normalize presets in scale.
      for (const regionOrDc of Object.keys(scaleFromConfig)) {
        const dc = regionOrDCToDc(regionOrDc);
        if (dc === undefined) {
          error(
            `The value "${regionOrDc}" in \`scale\` settings is not a valid region or DC identifier`,
            'deploy-invalid-dc'
          );
          await exit(1);
          return 1;
        }
        scale[dc] = scaleFromConfig[regionOrDc];
      }
    }

    debug(`Scale presets for deploy: ${JSON.stringify(scale)}`);
    const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });

    let dotenvConfig;
    let dotenvOption;

    if (argv.dotenv) {
      dotenvOption = argv.dotenv;
    } else if (nowConfig.dotenv) {
      dotenvOption = nowConfig.dotenv;
    }

    if (dotenvOption) {
      const dotenvFileName =
        typeof dotenvOption === 'string' ? dotenvOption : '.env';

      try {
        const dotenvFile = await fs.readFile(dotenvFileName);
        dotenvConfig = dotenv.parse(dotenvFile);
      } catch (err) {
        if (err.code === 'ENOENT') {
          error(
            `--dotenv flag is set but ${dotenvFileName} file is missing`,
            'missing-dotenv-target'
          );

          await exit(1);
        } else {
          throw err;
        }
      }
    }

    // Merge dotenv config, `env` from now.json, and `--env` / `-e` arguments
    const deploymentEnv = Object.assign(
      {},
      dotenvConfig,
      parseEnv(nowConfig.env, null),
      parseEnv(argv.env, undefined)
    );

    // Merge build env out of  `build.env` from now.json, and `--build-env` args
    const deploymentBuildEnv = Object.assign(
      {},
      parseEnv(nowConfig.build && nowConfig.build.env, null),
      parseEnv(argv['build-env'], undefined)
    );

    // If there's any envs with `null` then prompt the user for the values
    const envNullFields = getNullFields(deploymentEnv);
    const buildEnvNullFields = getNullFields(deploymentBuildEnv);
    const userEnv = await promptForEnvFields(
      uniq([...envNullFields, ...buildEnvNullFields]).sort()
    );
    for (const key of envNullFields) {
      deploymentEnv[key] = userEnv[key];
    }
    for (const key of buildEnvNullFields) {
      deploymentBuildEnv[key] = userEnv[key];
    }

    // If there's any undefined values, then inherit them from this process
    await addProcessEnv(deploymentEnv);
    await addProcessEnv(deploymentBuildEnv);

    // Put the `build.env` back onto the `nowConfig`
    if (Object.keys(deploymentBuildEnv).length > 0) {
      if (!nowConfig.build) nowConfig.build = {};
      nowConfig.build.env = deploymentBuildEnv;
    }

    const hasSecrets = Object.keys(deploymentEnv).some(key =>
      (deploymentEnv[key] || '').startsWith('@')
    );

    const secretsPromise = hasSecrets ? now.listSecrets() : null;

    const findSecret = async (uidOrName: string) => {
      const secrets = await Promise.resolve(secretsPromise);

      return secrets.filter(
        (secret: { name: string; uid: string }) =>
          secret.name === uidOrName || secret.uid === uidOrName
      );
    };

    const env_ = await Promise.all(
      Object.keys(deploymentEnv).map(async (key: string) => {
        if (!key) {
          error(
            'Environment variable name is missing',
            'missing-env-key-value'
          );

          await exit(1);
        }

        if (/[^A-z0-9_]/i.test(key)) {
          error(
            `Invalid ${chalk.dim('-e')} key ${chalk.bold(
              `"${chalk.bold(key)}"`
            )}. Only letters, digits and underscores are allowed.`
          );

          await exit(1);
        }

        let val: string | { uid: string } = deploymentEnv[key];

        if (val[0] === '@') {
          const uidOrName = val.substr(1);
          const _secrets = await findSecret(uidOrName);

          if (_secrets.length === 0) {
            if (uidOrName === '') {
              error(
                `Empty reference provided for env key ${chalk.bold(
                  `"${chalk.bold(key)}"`
                )}`
              );
            } else {
              error(
                `No secret found by uid or name ${chalk.bold(
                  `"${uidOrName}"`
                )}`,
                'env-no-secret'
              );
            }

            await exit(1);
          } else if (_secrets.length > 1) {
            error(
              `Ambiguous secret ${chalk.bold(
                `"${uidOrName}"`
              )} (matches ${chalk.bold(_secrets.length)} secrets)`
            );

            await exit(1);
          }

          val = { uid: _secrets[0].uid };
        }

        return [key, typeof val === 'string' ? val.replace(/^\\@/, '@') : val];
      })
    );

    const env: any = {};

    env_
      .filter(v => Boolean(v))
      .forEach(([key, val]) => {
        if (key in env) {
          note(`Overriding duplicate env key ${chalk.bold(`"${key}"`)}`);
        }

        // @ts-ignore
        env[key] = val;
      });

    const metadata = Object.assign(
      {},
      parseMeta(nowConfig.meta),
      parseMeta(argv.meta)
    );

    try {
      meta.name = getProjectName({
        argv,
        nowConfig,
        isFile,
        paths,
        pre: meta.name,
      });
      log(`Using project ${chalk.bold(meta.name)}`);
      const createArgs = Object.assign(
        {
          env,
          meta: metadata,
          followSymlinks,
          forceNew,
          withCache,
          forwardNpm,
          quiet,
          scale,
          wantsPublic,
          sessionAffinity,
          isFile,
          nowConfig,
          deployStamp,
        },
        meta
      );

      deployStamp = stamp();
      deployment = await createDeploy(
        output,
        now,
        contextName,
        paths,
        createArgs
      );

      if (
        deployment instanceof DomainNotFound ||
        deployment instanceof NotDomainOwner ||
        deployment instanceof DomainPermissionDenied ||
        deployment instanceof DomainVerificationFailed ||
        deployment instanceof SchemaValidationFailed ||
        deployment instanceof DeploymentNotFound ||
        deployment instanceof DeploymentsRateLimited
      ) {
        handleCreateDeployError(output, deployment);
        await exit(1);
        return;
      }
    } catch (err) {
      if (err.code === 'plan_requires_public') {
        if (!wantsPublic) {
          const who = currentTeam ? 'your team is' : 'you are';

          let proceed;
          log(
            `Your deployment's code and logs will be publicly accessible because ${who} subscribed to the OSS plan.`
          );

          if (isTTY) {
            proceed = await promptBool('Are you sure you want to proceed?', {
              trailing: eraseLines(1),
            });
          }

          let url = 'https://vercel.com/account/plan';

          if (currentTeam) {
            url = `https://vercel.com/teams/${contextName}/settings/plan`;
          }

          note(
            `You can use ${cmd(
              'now --public'
            )} or upgrade your plan to skip this prompt. More: ${url}`
          );

          if (!proceed) {
            if (typeof proceed === 'undefined') {
              const message = `If you agree with that, please run again with ${cmd(
                '--public'
              )}.`;
              error(message);

              await exit(1);
            } else {
              log('Aborted');
              await exit(0);
            }

            return;
          }
        }

        wantsPublic = true;

        return sync({
          contextName,
          output,
          token,
          config: {
            currentTeam,
          },
          firstRun: false,
          deploymentType,
        });
      }

      debug(`Error: ${err}\n${err.stack}`);

      if (err.keyword === 'additionalProperties' && err.dataPath === '.scale') {
        const { additionalProperty = '' } = err.params || {};
        const message = regions.length
          ? `Invalid regions: ${additionalProperty.slice(0, -1)}`
          : `Invalid DC name for the scale option: ${additionalProperty}`;
        error(message);
        await exit(1);
      }

      await stopDeployment(err);
      return 1;
    }

    const { url } = now;
    const dcs =
      deploymentType !== 'static' && deployment.scale
        ? ` (${chalk.bold(Object.keys(deployment.scale).join(', '))})`
        : '';

    if (isTTY) {
      let inClipboard = '';
      const platformVersion = deployment.version || 1;
      const displayUrl =
        Array.isArray(deployment.alias) &&
        deployment.alias.length > 0 &&
        !deployment.aliasError
          ? `https://${deployment.alias[0]}`
          : url;

      if (clipboard) {
        try {
          await copy(displayUrl);
          inClipboard = chalk.gray(' [in clipboard]');
        } catch (err) {
          debug(`Error copying to clipboard: ${err}`);
        }
      }

      log(
        chalk`{bold.cyan ${displayUrl}} {gray [v${platformVersion}]}${inClipboard}${dcs} ${deployStamp()}`
      );
    }

    if (deploymentType === 'static') {
      if (deployment.readyState === 'INITIALIZING') {
        // This static deployment requires a build, so show the logs
        noVerify = true;
      } else {
        if (!quiet) {
          log(chalk`{cyan Deployment complete!}`);
        }
        await exit(0);
        return;
      }
    }

    // Show build logs
    // (We have to add this check for flow but it will never happen)
    if (deployment !== null) {
      const instanceIndex = getInstanceIndex();
      const eventsStream = await maybeGetEventsStream(now, deployment);

      if (!noVerify) {
        log(
          `Verifying instantiation in ${joinWords(
            Object.keys(deployment.scale).map(dc => chalk.bold(dc))
          )}`
        );
        const verifyStamp = stamp();
        const verifyDCsGenerator = getVerifyDCsGenerator(
          output,
          now,
          deployment,
          eventsStream
        );

        for await (const _dcOrEvent of verifyDCsGenerator) {
          const dcOrEvent = _dcOrEvent as any;
          if (dcOrEvent instanceof VerifyScaleTimeout) {
            output.error(
              `Instance verification timed out (${ms(dcOrEvent.meta.timeout)})`
            );
            log('Read more: https://err.sh/now-cli/verification-timeout');
            await exit(1);
          } else if (Array.isArray(dcOrEvent)) {
            const [dc, instances] = dcOrEvent;
            log(
              `${chalk.cyan(chars.tick)} Scaled ${plural(
                'instance',
                instances,
                true
              )} in ${chalk.bold(dc)} ${verifyStamp()}`
            );
          } else if (
            dcOrEvent &&
            (dcOrEvent.type === 'stdout' || dcOrEvent.type === 'stderr')
          ) {
            const prefix = chalk.gray(
              `[${instanceIndex(dcOrEvent.payload.instanceId)}] `
            );
            formatLogOutput(dcOrEvent.payload.text, prefix).forEach(
              (msg: string) => log(msg)
            );
          }
        }
      }

      output.success(`Deployment ready`);
      await exit(0);
    }
  });
}

async function readMeta(
  _path: string,
  _deploymentName: string,
  deploymentType?: string,
  _sessionAffinity?: string
): Promise<any> {
  try {
    const meta = await readMetaData(_path, {
      deploymentType,
      deploymentName: _deploymentName,
      quiet: true,
      sessionAffinity: _sessionAffinity,
    });

    if (!deploymentType) {
      deploymentType = meta.type;
      debug(`Detected \`deploymentType\` = \`${deploymentType}\``);
    }

    if (!_deploymentName) {
      _deploymentName = meta.name;
      debug(`Detected \`deploymentName\` = "${_deploymentName}"`);
    }

    return {
      meta,
      deploymentName: _deploymentName,
      deploymentType,
      sessionAffinity: _sessionAffinity,
    };
  } catch (err) {
    if (isTTY && err.code === 'multiple_manifests') {
      debug('Multiple manifests found, disambiguating');
      log(
        `Two manifests found. Press [${chalk.bold(
          'n'
        )}] to deploy or re-run with --flag`
      );

      try {
        deploymentType = await promptOptions([
          ['npm', `${chalk.bold('package.json')}\t${chalk.gray('   --npm')} `],
          ['docker', `${chalk.bold('Dockerfile')}\t${chalk.gray('--docker')} `],
        ]);
      } catch (_) {
        throw err;
      }

      debug(`Selected \`deploymentType\` = "${deploymentType}"`);
      return readMeta(_path, _deploymentName, deploymentType);
    }

    throw err;
  }
}

function getRegionsFromConfig(config: any = {}): string[] {
  return config.regions || [];
}

function getScaleFromConfig(config: any = {}): DcScale {
  return config.scale || {};
}

async function maybeGetEventsStream(now: Now, deployment: any) {
  try {
    return await getEventsStream(now, deployment.deploymentId, {
      direction: 'forward',
      follow: true,
    });
  } catch (error) {
    return null;
  }
}

function getVerifyDCsGenerator(
  output: Output,
  now: Now,
  deployment: any,
  eventsStream: any
) {
  const verifyDeployment = verifyDeploymentScale(
    output,
    now,
    deployment.deploymentId || deployment.uid,
    deployment.scale
  );

  return eventsStream
    ? raceAsyncGenerators(
        eventListenerToGenerator('data', eventsStream),
        verifyDeployment
      )
    : verifyDeployment;
}

function handleCreateDeployError(output: Output, error: Error) {
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
    const { message, params, keyword, dataPath } = error.meta as any;

    if (params && params.additionalProperty) {
      const prop = params.additionalProperty;

      output.error(
        `The property ${code(prop)} is not allowed in ${highlight(
          'now.json'
        )} when using Now 1.0 – please remove it.`
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

    output.error(
      `Failed to validate ${highlight(
        'now.json'
      )}: ${message}\nDocumentation: ${link(
        'https://vercel.com/docs/configuration'
      )}`
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
  if (error instanceof DomainNotFound) {
    output.error(
      `The domain used as a suffix ${chalk.underline(
        error.meta.domain
      )} no longer exists. Please update or remove your custom suffix.`
    );
    return 1;
  }
  if (error instanceof DeploymentNotFound) {
    output.error(error.message);
    return 1;
  }
  if (error instanceof DeploymentsRateLimited) {
    output.error(error.message);
    return 1;
  }

  return error;
}
