//@flow

import ms from 'ms';
import bytes from 'bytes';
import title from 'title';
import { write as copy } from 'clipboardy';
import sleep from 'es7-sleep';
import { basename } from 'path';
import table from 'text-table';
import chalk from 'chalk';
import Progress from 'progress';
import logo from '../../util/output/logo';
import eraseLines from '../../util/output/erase-lines';
import strlen from '../../util/strlen';
import { handleError } from '../../util/error';
import getArgs from '../../util/get-args';
import type { CLIContext, HandlersDeployment, Output } from '../../util/types';
import toHumanPath from '../../util/humanize-path';
import Now from '../../util';
import stamp from '../../util/output/stamp';
import createDeploy from '../../util/deploy/create-deploy';
import dnsTable from '../../util/dns-table';
import zeitWorldTable from '../../util/zeit-world-table';
import type { CreateDeployError } from '../../util/deploy/create-deploy';
import * as Errors from '../../util/errors';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now`)} [options] <command | path>

  ${chalk.dim('Commands:')}

    ${chalk.dim('Cloud')}

      deploy               [path]      Performs a deployment ${chalk.bold(
        '(default)'
      )}
      ls | list            [app]       Lists deployments
      rm | remove          [id]        Removes a deployment
      ln | alias           [id] [url]  Configures aliases for deployments
      inspect              [id]        Displays information related to a deployment
      domains              [name]      Manages your domain names
      certs                [cmd]       Manages your SSL certificates
      secrets              [name]      Manages your secret environment variables
      dns                  [name]      Manages your DNS records
      logs                 [url]       Displays the logs for a deployment
      scale                [args]      Scales the instance count of a deployment
      help                 [cmd]       Displays complete help for [cmd]

    ${chalk.dim('Administrative')}

      billing | cc         [cmd]       Manages your credit cards and billing methods
      upgrade | downgrade  [plan]      Upgrades or downgrades your plan
      teams                [team]      Manages your teams
      switch               [scope]     Switches between teams and your personal account
      login                [email]     Logs into your account or creates a new one
      logout                           Logs out of your account
      whoami                           Displays the current scope

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    -n, --name                     Set the name of the deployment
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -f, --force                    Force a new deployment even if nothing has changed
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline(
    'TOKEN'
  )}        Login token
    -l, --links                    Copy symlinks without resolving their target
    -p, --public                   Deployment is public (${chalk.dim(
      '`/_src`'
    )} is exposed) [on for oss, off for premium]
    -e, --env                      Include an env var during run time (e.g.: ${chalk.dim(
      '`-e KEY=value`'
    )}). Can appear many times.
    -b, --build-env                Similar to ${chalk.dim(
      '`--env`'
    )} but for build time only.
    -m, --meta                     Add metadata for the deployment (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.
    -C, --no-clipboard             Do not attempt to copy URL to clipboard
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan('$ now')}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan('$ now /usr/src/project')}

  ${chalk.gray('–')} Deploy with environment variables

    ${chalk.cyan('$ now -e NODE_ENV=production -e SECRET=@mysql-secret')}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
    '`list`'
  )}

    ${chalk.cyan('$ now help list')}
`);
};

exports.args = {
  '--name': String,
  '--force': Boolean,
  '--links': Boolean,
  '--public': Boolean,
  '--no-clipboard': Boolean,
  '--env': [String],
  '--build-env': [String],
  '--meta': [String],
  '-n': '--name',
  '-f': '--force',
  '-l': '--links',
  '-p': '--public',
  '-e': '--env',
  '-b': '--build-env',
  '-C': '--no-clipboard',
  '-m': '--meta'
};

const prepareState = state => title(state.replace('_', ' '));

// That's how long the word "Initializing" is
const longestState = 12;

const renderHandlers = (print, list, times, run) => {
  const final = table(
    [
      ...list.map(handler => {
        const {path, readyState, id} = handler;
        const state = prepareState(readyState).padEnd(longestState);
        const url = `${id.replace('hdl_', '')}.invoke.sh`;

        let stateColor = chalk.grey;
        let pathColor = chalk.cyan;
        let time = '';

        if (readyState === 'READY') {
          stateColor = item => item;
          time = times[id];
        } else if (readyState.endsWith('_ERROR')) {
          stateColor = chalk.red;
          pathColor = chalk.red;
        }

        return [
          `${chalk.grey('-')} ${pathColor(path)}`,
          stateColor(state),
          url && stateColor(url),
          time
        ];
      })
    ],
    {
      align: ['l', 'l', 'l', 'l'],
      hsep: ' '.repeat(3),
      stringLength: strlen
    }
  );

  if (run > 1) {
    // Account for the newline at the end
    print(eraseLines(list.length + 1));
  }

  print(`${final}\n`);
};

const isDone = ({ readyState }) => readyState === 'READY' || readyState.endsWith('_ERROR');

const allDone = (list) => {
  if (list.length === 0) {
    return false;
  }

  return list.every(isDone);
};

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

const parseMeta = (meta) => {
  if (!meta) {
    return {};
  }

  if (typeof meta === 'string') {
    meta = [meta];
  }

  const parsed = {};

  meta.forEach(item => {
    const [key, value] = item.split('=');
    parsed[key] = value || '';
  });

  return parsed;
};

// Converts `env` Arrays, Strings and Objects into env Objects.
// `null` empty value means to prompt user for value upon deployment.
// `undefined` empty value means to inherit value from user's env.
const parseEnv = (env, empty) => {
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

exports.pipe = async function main(
  ctx: CLIContext,
  contextName: string,
  output: Output,
  stats: any,
  localConfig: any,
  isFile: boolean,
  platformVersion: number
): Promise<number> {
  let argv = null;

  try {
    argv = getArgs(ctx.argv.slice(2), exports.args);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const { apiUrl, authConfig: { token }, config: { currentTeam } } = ctx;

  return new Promise(async (resolveRoot, rejectRoot) => {
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
    const filesName = isFile ? 'file' : paths.length === 1 ? basename(paths[0]) : 'files';
    const meta = Object.assign({}, parseMeta(localConfig.meta), parseMeta(argv['--meta']));

    let syncCount;
    let deployStamp = stamp();
    let deployment: HandlersDeployment | null = null;

    // Merge dotenv config, `env` from now.json, and `--env` / `-e` arguments
    const deploymentEnv = Object.assign(
      {},
      parseEnv(localConfig.env, null),
      parseEnv(argv.env, undefined)
    );

    // Merge build env out of  `build.env` from now.json, and `--build-env` args
    const deploymentBuildEnv = Object.assign(
      {},
      parseEnv(localConfig.build && localConfig.build.env, null),
      parseEnv(argv['build-env'], undefined)
    );

    // If there's any undefined values, then inherit them from this process
    try {
      await addProcessEnv(log, deploymentEnv);
      await addProcessEnv(log, deploymentBuildEnv);
    } catch (err) {
      error(err.message);
      return 1;
    }

    try {
      // $FlowFixMe
      const createArgs = Object.assign(
        {
          env: deploymentEnv,
          buildEnv: deploymentBuildEnv,
          followSymlinks: argv['--links'],
          forceNew: argv['--force'],
          quiet,
          wantsPublic: argv['--public'] || localConfig.public,
          isFile,
          type: null,
          handlers: localConfig.handlers,
          routes: localConfig.routes,
          meta
        },
        {
          name: argv['--name'] || localConfig.name || filesName
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
        firstDeployCall instanceof Errors.CantSolveChallenge ||
        firstDeployCall instanceof Errors.CantGenerateWildcardCert ||
        firstDeployCall instanceof Errors.DomainConfigurationError ||
        firstDeployCall instanceof Errors.DomainNameserversNotFound ||
        firstDeployCall instanceof Errors.DomainNotFound ||
        firstDeployCall instanceof Errors.DomainNotVerified ||
        firstDeployCall instanceof Errors.DomainPermissionDenied ||
        firstDeployCall instanceof Errors.DomainsShouldShareRoot ||
        firstDeployCall instanceof Errors.DomainValidationRunning ||
        firstDeployCall instanceof Errors.DomainVerificationFailed ||
        firstDeployCall instanceof Errors.InvalidWildcardDomain ||
        firstDeployCall instanceof Errors.CDNNeedsUpgrade ||
        firstDeployCall instanceof Errors.TooManyCertificates ||
        firstDeployCall instanceof Errors.TooManyRequests
      ) {
        handleCreateDeployError(output, firstDeployCall);
        resolveRoot(1);

        return;
      }

      deployment = firstDeployCall;

      if (now.syncFileCount > 0) {
        const uploadStamp = stamp();

        await new Promise(resolve => {
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
            rejectRoot(err);
          });
        });

        if (!quiet && syncCount) {
          log(
            `Synced ${syncCount} (${bytes(now.syncAmount)}) ${uploadStamp()}`
          );
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
            secondDeployCall instanceof Errors.CantSolveChallenge ||
            secondDeployCall instanceof Errors.CantGenerateWildcardCert ||
            secondDeployCall instanceof Errors.DomainConfigurationError ||
            secondDeployCall instanceof Errors.DomainNameserversNotFound ||
            secondDeployCall instanceof Errors.DomainNotFound ||
            secondDeployCall instanceof Errors.DomainNotVerified ||
            secondDeployCall instanceof Errors.DomainPermissionDenied ||
            secondDeployCall instanceof Errors.DomainsShouldShareRoot ||
            secondDeployCall instanceof Errors.DomainValidationRunning ||
            secondDeployCall instanceof Errors.DomainVerificationFailed ||
            secondDeployCall instanceof Errors.InvalidWildcardDomain ||
            secondDeployCall instanceof Errors.CDNNeedsUpgrade ||
            secondDeployCall instanceof Errors.TooManyCertificates ||
            secondDeployCall instanceof Errors.TooManyRequests
          ) {
            handleCreateDeployError(output, secondDeployCall);
            resolveRoot(1);

            return;
          }

          if (now.syncFileCount === 0) {
            deployment = secondDeployCall;
            break;
          }
        }

        if (deployment === null) {
          error('Uploading failed. Please try again.');
          resolveRoot(1);

          return;
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
      resolveRoot(1);

      return;
    }

    const { url } = now;
    const dcs = '';
    const version = platformVersion === null ? 'v2' : `v${platformVersion}`;

    if (isTTY) {
      if (!argv['--no-clipboard']) {
        try {
          await copy(url);
          log(
            `${chalk.bold(
              chalk.cyan(url)
            )} ${chalk.gray(`[${version}]`)} ${chalk.gray('[in clipboard]')}${dcs} ${deployStamp()}`
          );
        } catch (err) {
          debug(`Error copying to clipboard: ${err}`);
          log(
            `${chalk.bold(
              chalk.cyan(url)
            )} ${chalk.gray(`[${version}]`)} ${chalk.gray('[in clipboard]')}${dcs} ${deployStamp()}`
          );
        }
      } else {
        log(`${chalk.bold(chalk.cyan(url))}${dcs} ${deployStamp()}`);
      }
    } else {
      process.stdout.write(url);
    }

    if (deployment.readyState === 'READY') {
      output.success(`Deployment ready`);
      resolveRoot(0);

      return;
    }

    const sleepingTime = ms('3s');
    const times = {};

    let handlers = [];
    let run = 1;

    while (!allDone(handlers)) {
      const handlersUrl = `/v1/now/deployments/${deployment.id}/handlers`;
      const response = await now.fetch(handlersUrl);

      let readyState = null;

      switch (run) {
        case 1:
          readyState = 'INITIALIZING';
          break;
        case 2:
          readyState = 'ANALYZING';
          break;
        case 3:
          readyState = 'BUILDING';
          break;
        case 4:
          readyState = 'DEPLOYING';
          break;
        default:
          readyState = 'READY';
      }

      handlers = response.handlers.map(handler => {
        const id = handler.id;
        const filled = Object.assign({}, handler, { readyState });

        if (times[id]) {
          if (isDone(filled)) {
            times[id] = times[id]();
          }
        } else {
          times[id] = stamp();
        }

        return filled;
      });

      renderHandlers(print, handlers, times, run);
      run++;

      if (!allDone(handlers)) {
        await sleep(sleepingTime);
      }
    }

    output.success(`Deployment ready`);
    resolveRoot(0);
  });
};

function handleCreateDeployError<OtherError>(
  output: Output,
  error: CreateDeployError | OtherError
): 1 | OtherError {
  if (error instanceof Errors.CantGenerateWildcardCert) {
    output.error(
      `Custom suffixes are only allowed for domains in ${chalk.underline(
        'zeit.world'
      )}`
    );
    return 1;
  } else if (error instanceof Errors.CantSolveChallenge) {
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
      output.print(dnsTable([['', 'ALIAS', 'alias.zeit.co']]) + '\n');
    }
    return 1;
  } else if (error instanceof Errors.DomainConfigurationError) {
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
        dnsTable([
          error.meta.subdomain === null
            ? ['', 'ALIAS', 'alias.zeit.co']
            : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
        ]) + '\n'
      );
    } else {
      output.print(
        `  We configured them for you, but the propagation may take a few minutes.\n`
      );
      output.print(`  Please try again later.\n`);
    }
    return 1;
  } else if (error instanceof Errors.DomainNameserversNotFound) {
    output.error(
      `Couldn't find nameservers for the domain ${chalk.underline(
        error.meta.domain
      )}`
    );
    return 1;
  } else if (error instanceof Errors.DomainNotVerified) {
    output.error(
      `The domain used as a suffix ${chalk.underline(
        error.meta.domain
      )} is not verified and can't be used as custom suffix.`
    );
    return 1;
  } else if (error instanceof Errors.DomainPermissionDenied) {
    output.error(
      `You don't have permissions to access the domain used as a suffix ${chalk.underline(
        error.meta.domain
      )}.`
    );
    return 1;
  } else if (error instanceof Errors.DomainsShouldShareRoot) {
    // this is not going to happen
    return 1;
  } else if (error instanceof Errors.DomainValidationRunning) {
    output.error(
      `There is a validation in course for ${chalk.underline(
        error.meta.domain
      )}. Wait until it finishes.`
    );
    return 1;
  } else if (error instanceof Errors.DomainVerificationFailed) {
    output.error(
      `We couldn't verify the domain ${chalk.underline(error.meta.domain)}.\n`
    );
    output.print(
      `  Please make sure that your nameservers point to ${chalk.underline(
        'zeit.world'
      )}.\n`
    );
    output.print(
      `  Examples: (full list at ${chalk.underline('https://zeit.world')})\n`
    );
    output.print(zeitWorldTable() + '\n');
    output.print(
      `\n  As an alternative, you can add following records to your DNS settings:\n`
    );
    output.print(
      dnsTable(
        [
          ['_now', 'TXT', error.meta.token],
          error.meta.subdomain === null
            ? ['', 'ALIAS', 'alias.zeit.co']
            : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
        ],
        { extraSpace: '  ' }
      ) + '\n'
    );
    return 1;
  } else if (error instanceof Errors.InvalidWildcardDomain) {
    // this should never happen
    output.error(
      `Invalid domain ${chalk.underline(
        error.meta.domain
      )}. Wildcard domains can only be followed by a root domain.`
    );
    return 1;
  } else if (error instanceof Errors.CDNNeedsUpgrade) {
    output.error(`You can't add domains with CDN enabled from an OSS plan`);
    return 1;
  } else if (error instanceof Errors.TooManyCertificates) {
    output.error(
      `Too many certificates already issued for exact set of domains: ${error.meta.domains.join(
        ', '
      )}`
    );
    return 1;
  } else if (error instanceof Errors.TooManyRequests) {
    output.error(
      `Too many requests detected for ${error.meta
        .api} API. Try again in ${ms(error.meta.retryAfter * 1000, {
        long: true
      })}.`
    );
    return 1;
  } else if (error instanceof Errors.DomainNotFound) {
    output.error(
      `The domain used as a suffix ${chalk.underline(
        error.meta.domain
      )} no longer exists. Please update or remove your custom suffix.`
    );
    return 1;
  }

  return error;
}
