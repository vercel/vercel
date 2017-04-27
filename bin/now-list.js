#!/usr/bin/env node

// Packages
const fs = require('fs-promise');
const minimist = require('minimist');
const chalk = require('chalk');
const ms = require('ms');
const printf = require('printf');

// Ours
const Now = require('../lib');
const login = require('../lib/login');
const cfg = require('../lib/cfg');
const { handleError, error } = require('../lib/error');
const logo = require('../lib/utils/output/logo');

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug', 'all'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't'
  }
});

const help = () => {
  console.log(
    `
  ${chalk.bold(`${logo} now list`)} [app]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all deployments

    ${chalk.cyan('$ now ls')}

  ${chalk.gray('–')} List all deployments for the app ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now ls my-app')}

  ${chalk.dim('Alias:')} ls
`
  );
};

if (argv.help) {
  help();
  process.exit(0);
}

const app = argv._[0];

// Options
const debug = argv.debug;
const apiUrl = argv.url || 'https://api.zeit.co';

if (argv.config) {
  cfg.setConfigFile(argv.config);
}

Promise.resolve().then(async () => {
  const config = await cfg.read();

  let token;
  try {
    token = argv.token || config.token || (await login(apiUrl));
  } catch (err) {
    error(`Authentication error – ${err.message}`);
    process.exit(1);
  }

  try {
    await list({token, config});
  } catch (err) {
    error(`Unknown error: ${err}\n${err.stack}`);
    process.exit(1);
  }
});

async function list({token, config: {currentTeam}}) {
  const now = new Now({apiUrl, token, debug, currentTeam });
  const start = new Date();

  let deployments;
  try {
    deployments = await now.list(app);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }

  now.close();

  const apps = new Map();

  if (argv.all && !app) {
    console.log('> You must define app when using `--all`');
    process.exit(1);
  }
  if (argv.all) {
    await Promise.all(
      deployments.map(async ({ uid }, i) => {
        deployments[i].instances = await now.listInstances(uid);
      })
    );
  }

  for (const dep of deployments) {
    const deps = apps.get(dep.name) || [];
    apps.set(dep.name, deps.concat(dep));
  }

  const sorted = await sort([...apps]);

  const urlLength = deployments.reduce(
    (acc, i) => {
      return Math.max(acc, (i.url && i.url.length) || 0);
    },
    0
  ) + 5;
  const timeNow = new Date();
  console.log(
    `> Fetched ${deployments.length} deployments ${chalk.grey('[' + ms(timeNow - start) + ']')}`
  );

  let shouldShowAllInfo = false;
  for (const app of apps) {
    shouldShowAllInfo = app[1].length > 5 ||
      app.find(depl => {
        return depl.scale && depl.scale.current > 1;
      });
    if (shouldShowAllInfo) {
      break;
    }
  }
  if (!argv.all && shouldShowAllInfo) {
    console.log(
      `> To expand list and see instances run ${chalk.cyan('`now ls --all [app]`')}`
    );
  }
  console.log();
  sorted.forEach(([name, deps]) => {
    const listedDeployments = argv.all ? deps : deps.slice(0, 5);
    console.log(
      `${chalk.bold(name)} ${chalk.gray('(' + listedDeployments.length + ' of ' + deps.length + ' total)')}`
    );
    const urlSpec = `%-${urlLength}s`;
    console.log(
      printf(
        ` ${chalk.grey(urlSpec + '  %8s    %-16s %8s')}`,
        'url',
        'inst #',
        'state',
        'age'
      )
    );
    listedDeployments.forEach(dep => {
      let state = dep.state;
      let extraSpaceForState = 0;
      if (state === null || typeof state === 'undefined') {
        state = 'DEPLOYMENT_ERROR';
      }
      if (/ERROR/.test(state)) {
        state = chalk.red(state);
        extraSpaceForState = 10;
      } else if (state === 'FROZEN') {
        state = chalk.grey(state);
        extraSpaceForState = 10;
      }
      console.log(
        printf(
          ` %-${urlLength + 10}s %8s    %-${extraSpaceForState + 16}s %8s`,
          chalk.underline(dep.url),
          dep.scale.current,
          state,
          ms(timeNow - dep.created)
        )
      );
      if (Array.isArray(dep.instances) && dep.instances.length > 0) {
        dep.instances.forEach(i => {
          console.log(
            printf(` %-${urlLength + 10}s`, ` - ${chalk.underline(i.url)}`)
          );
        });
        console.log();
      }
    });
    console.log();
  });

  const elapsed = ms(new Date() - start);
  console.log(
    `> ${deployments.length} deployment${deployments.length === 1 ? '' : 's'} found ${chalk.gray(`[${elapsed}]`)}`
  );
}

async function sort(apps) {
  let pkg;
  try {
    const json = await fs.readFile('package.json');
    pkg = JSON.parse(json);
  } catch (err) {
    pkg = {};
  }

  return apps
    .map(([name, deps]) => {
      deps = deps.slice().sort((a, b) => {
        return b.created - a.created;
      });
      return [name, deps];
    })
    .sort(([nameA, depsA], [nameB, depsB]) => {
      if (pkg.name === nameA) {
        return -1;
      }

      if (pkg.name === nameB) {
        return 1;
      }

      return depsB[0].created - depsA[0].created;
    });
}
