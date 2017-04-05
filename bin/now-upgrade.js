#!/usr/bin/env node

// Packages
const chalk = require('chalk');
const minimist = require('minimist');
const ms = require('ms');
const stripAnsi = require('strip-ansi');

// Ours
const login = require('../lib/login');
const cfg = require('../lib/cfg');
const NowPlans = require('../lib/plans');
const indent = require('../lib/indent');
const listInput = require('../lib/utils/input/list');
const code = require('../lib/utils/output/code');
const error = require('../lib/utils/output/error');
const success = require('../lib/utils/output/success');
const cmd = require('../lib/utils/output/cmd');
const logo = require('../lib/utils/output/logo');

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug'],
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
  ${chalk.bold(`${logo} now upgrade`)} [plan]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List available plans and pick one interactively

      ${chalk.cyan('$ now upgrade')}

      ${chalk.yellow('NOTE:')} ${chalk.gray('Make sure you have a payment method, or add one:')}

      ${chalk.cyan(`$ now billing add`)}

  ${chalk.gray('–')} Pick a specific plan (premium):

      ${chalk.cyan(`$ now upgrade premium`)}
  `
  );
};

// Options
const debug = argv.debug;
const apiUrl = argv.url || 'https://api.zeit.co';

if (argv.config) {
  cfg.setConfigFile(argv.config);
}

const exit = code => {
  // We give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100);
};

if (argv.help) {
  help();
  exit(0);
} else {
  const config = cfg.read();

  Promise.resolve(argv.token || config.token || login(apiUrl))
    .then(async token => {
      try {
        await run(token);
      } catch (err) {
        if (err.userError) {
          error(err.message);
        } else {
          error(`Unknown error: ${err.stack}`);
        }
        exit(1);
      }
    })
    .catch(e => {
      error(`Authentication error – ${e.message}`);
      exit(1);
    });
}

function buildInquirerChoices(current, until) {
  if (until) {
    until = until.split(' ');
    until = ' for ' + chalk.bold(until[0]) + ' more ' + until[1];
  } else {
    until = '';
  }
  const ossTitle = current === 'oss'
    ? `oss FREE ${' '.repeat(28)} (current)`
    : 'oss FREE';
  const premiumTitle = current === 'premium'
    ? `premium $15/mo ${' '.repeat(24 - stripAnsi(until).length)} (current${until})`
    : 'premium $15/mo';
  return [
    {
      name: [
        ossTitle,
        indent('✓ All code is public and open-source', 2),
        indent('✓ 20 deploys per month | 1GB monthly bandwidth', 2),
        indent('✓ 1GB FREE storage | 1MB size limit per file', 2)
      ].join('\n'),
      value: 'oss',
      short: 'oss FREE'
    },
    {
      name: [
        premiumTitle,
        indent('✓ All code is private and secure', 2),
        indent('✓ 1000 deploys per month | 50GB monthly bandwidth', 2),
        indent('✓ 100GB storage | No filesize limit', 2)
      ].join('\n'),
      value: 'premium',
      short: 'premium $15/mo'
    }
  ];
}

async function run(token) {
  const args = argv._;
  if (args.length > 1) {
    error('Invalid number of arguments');
    return exit(1);
  }

  const start = new Date();
  const plans = new NowPlans(apiUrl, token, { debug });

  let planId = args[0];

  if (![undefined, 'oss', 'premium'].includes(planId)) {
    error(`Invalid plan name – should be ${code('oss')} or ${code('premium')}`);
    return exit(1);
  }

  const currentPlan = await plans.getCurrent();

  if (planId === undefined) {
    const elapsed = ms(new Date() - start);

    let message = `To manage this from the web UI, head to https://zeit.co/account\n`;
    message += `> Selecting a plan for your account ${chalk.gray(`[${elapsed}]`)}`;
    const choices = buildInquirerChoices(currentPlan.id, currentPlan.until);

    planId = await listInput({
      message,
      choices,
      separator: true,
      abort: 'end'
    });
  }

  if (
    planId === undefined ||
    (planId === currentPlan.id && currentPlan.until === undefined)
  ) {
    return console.log('No changes made');
  }

  let newPlan;

  try {
    newPlan = await plans.set(planId);
  } catch (err) {
    let errorBody;
    if (err.res && err.res.status === 400) {
      errorBody = err.res.json();
    } else {
      const message = 'A network error has occurred. Please retry.';
      errorBody = { message };
    }

    const _err = (await errorBody).error;
    const { code, message } = _err;

    if (code === 'customer_not_found' || code === 'source_not_found') {
      error(
        `You have no payment methods available. Run ${cmd('now billing add')} to add one`
      );
    } else {
      error(`An unknow error occured. Please try again later ${message}`);
    }
    plans.close();
    return;
  }

  if (currentPlan.until && newPlan.id === 'premium') {
    success(
      `The cancelation has been undone. You're back on the ${chalk.bold('Premium plan')}`
    );
  } else if (newPlan.until) {
    success(
      `Your plan will be switched to OSS in ${chalk.bold(newPlan.until)}. Your card will not be charged again`
    );
  } else {
    success(`You're now on the ${chalk.bold('Premium plan')}`);
  }

  plans.close();
}
