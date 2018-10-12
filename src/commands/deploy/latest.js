//@flow

import ms from 'ms';
import bytes from 'bytes';
import { write as copy } from 'clipboardy';
import sleep from 'es7-sleep';
import { basename } from 'path';
import chalk from 'chalk';
import Progress from 'progress';
import logo from '../../util/output/logo';
import strlen from '../../util/strlen';
import table from '../../util/output/table';
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
    -E ${chalk.underline('FILE')}, --dotenv=${chalk.underline(
    'FILE'
  )}         Include env vars from .env file. Defaults to '.env'
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
  '--env': [String],
  '--build-env': [String],
  '-n': '--name',
  '-f': '--force',
  '-l': '--links',
  '-p': '--public',
  '-e': '--env',
  '-b': '--build-env'
};

const prepareState = state => state.toLowerCase().replace(/^\w/, c => c.toUpperCase());

const renderHandlers = (list) => {
  let output = '';

  for (const handler of list) {
    const {path, readyState, id} = handler;
    output += `${chalk.grey('-')} ${chalk.cyan(path)} ${prepareState(readyState)} ${id}\n`;
  }

  const input = [['ddas', 'dasdas', 'dasda'], ['dsad', 'dsadasA', 'dsaadsads']];
  console.log(output);

  console.log(table(input, {
  align: ['l', 'l', 'r', 'c', 'r'],
      hsep: ' '.repeat(2),
      stringLength: strlen
  }
  ));
};

exports.pipe = async function main(
  ctx: CLIContext,
  contextName: string,
  output: Output,
  stats: any
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

  try {
    return sync({
      contextName,
      output,
      argv,
      apiUrl,
      stats,
      token,
      currentTeam
    });
  } catch (err) {
    handleError(err);
    return 1;
  }
};

async function sync({
  contextName,
  output,
  argv,
  apiUrl,
  stats,
  token,
  currentTeam
}) {
  return new Promise(async (resolveRoot, rejectRoot) => {
    const { log, debug, error } = output;
    const paths = Object.keys(stats);
    const isFile = paths.length === 1 && stats[paths[0]].isFile();
    const debugEnabled = argv['--debug'];
    let wantsPublic = argv['--public'];
    const deploymentName = argv['--name'];
    const clipboard = true;

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

    const meta = {
      name:
        deploymentName ||
        (isFile ? 'file' : paths.length === 1 ? basename(paths[0]) : 'files'),
      deploymentType: 'npm',
      pkg: undefined,
      nowConfig: undefined,
      hasNowJson: false
    };

    let syncCount;
    let deployStamp = stamp();
    let deployment: HandlersDeployment | null = null;

    try {
      // $FlowFixMe
      const createArgs = Object.assign(
        {
          env: {},
          followSymlinks: argv['--links'],
          forceNew: argv['--force'],
          forwardNpm: null,
          quiet,
          wantsPublic,
          isFile,
          isHandlers: true
        },
        meta
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

    if (isTTY) {
      if (clipboard) {
        try {
          await copy(url);
          log(
            `${chalk.bold(
              chalk.cyan(url)
            )} ${chalk.gray('[in clipboard]')}${dcs} ${deployStamp()}`
          );
        } catch (err) {
          debug(`Error copying to clipboard: ${err}`);
          log(
            `${chalk.bold(
              chalk.cyan(url)
            )} ${chalk.gray('[in clipboard]')}${dcs} ${deployStamp()}`
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

    const handlers = [];
    const sleepingTime = ms('3s');

    const allDone = handlers.every(({ readyState }) => {
      return readyState === 'READY' || readyState.endsWith('_ERROR');
    });

    let run = 1;

    while (handlers.length === 0 || !allDone) {
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

      for (const item of response.handlers) {
        const modified = Object.assign({}, item, { readyState });
        handlers.push(modified);
      }

      renderHandlers(handlers);
      run++;

      await sleep(sleepingTime);
    }

    output.success(`Deployment ready`);
    resolveRoot(0);
  });
}

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
