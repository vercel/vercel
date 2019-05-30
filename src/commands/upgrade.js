import chalk from 'chalk';
import createOutput from '../util/output';
import cmd from '../util/output/cmd.ts';
import logo from '../util/output/logo';
import { handleError } from '../util/error';
import Client from '../util/client.ts';
import getScope from '../util/get-scope.ts';
import getArgs from '../util/get-args';
import promptBool from '../util/prompt-bool';
import Now from '../util';
import wait from '../util/output/wait';
import plans from '../util/plans';

const help = type => {
  console.log(`
  ${chalk.bold(`${logo} now ${type}`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -y, --yes                      Skip the confirmation prompt

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} ${type === 'upgrade'
    ? 'Upgrade to the Unlimited plan'
    : 'Downgrade to the Free plan'}

      ${chalk.cyan(`$ now ${type}`)}
      ${type === 'upgrade'
        ? `
      ${chalk.yellow('NOTE:')} ${chalk.gray(
            'Make sure you have a payment method, or add one:'
          )}

      ${chalk.cyan(`$ now billing add`)}
      `
        : ''}
  ${chalk.gray('–')} ${type === 'upgrade'
    ? 'Upgrade to the Unlimited plan without confirming'
    : 'Downgrade to the Free plan without confirming'}

      ${chalk.cyan(`$ now ${type} --yes`)}
  `);
};

const upgradeToUnlimited = async ({ error }, now, reactivation = false) => {
  const cancelWait = wait(reactivation ? 'Re-activating' : 'Upgrading');

  try {
    await now.fetch(`/plan`, {
      method: 'PUT',
      body: {
        plan: 'unlimited',
        reactivation
      }
    });
  } catch (err) {
    cancelWait();

    if (err.code === 'no_team_owner') {
      error(
        `You are not an owner of this team. Please ask an owner to upgrade your membership.`
      );
      return 1;
    }

    if (err.code === 'customer_not_found') {
      error(
        `No payment method available. Please add one using ${cmd(
          'now billing add'
        )} before upgrading.`
      );
      return 1;
    }

    error(`Not able to upgrade. Please try again later.`);
    return 1;
  }

  cancelWait();
};

const downgradeToFree = async ({ error }, now) => {
  const cancelWait = wait('Downgrading');

  try {
    await now.fetch(`/plan`, {
      method: 'PUT',
      body: {
        plan: 'free'
      }
    });
  } catch (err) {
    cancelWait();

    if (err.code === 'no_team_owner') {
      error(
        `You are not an owner of this team. Please ask an owner to upgrade your membership.`
      );
      return 1;
    }

    error(`Not able to downgrade. Please try again later.`);
    return 1;
  }

  cancelWait();
};

export default async function main(ctx) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes'
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const type = argv._[0];
  const skipConfirmation = argv['--yes'];

  if (argv['--help']) {
    help(type);
    return 2;
  }

  const apiUrl = ctx.apiUrl;
  const debugEnabled = argv['--debug'];
  const output = createOutput({ debug: debugEnabled });
  const { log, success } = output;

  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled
  });
  let user = null;
  let team = null;

  try {
    ({ user, team } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const prefix = currentTeam
    ? `Your team ${chalk.bold(team.name)} is`
    : 'You are';
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });
  const billing = currentTeam ? team.billing : user.billing;
  const plan = (billing && billing.plan) || 'free';

  if (billing && billing.cancelation) {
    const date = new Date(billing.cancelation).toLocaleString();

    log(
      `Your subscription is set to ${chalk.bold('downgrade')} on ${chalk.bold(
        date
      )}.`
    );
    const confirmed =
      skipConfirmation ||
      (await promptBool(
        output,
        `Would you like to prevent this from happening?`
      ));

    if (!confirmed) {
      log(`No action taken`);
      return 0;
    }

    await upgradeToUnlimited(output, now, true);
    success(`${prefix} back on the ${chalk.bold(plans[plan])} plan. Enjoy!`);

    return 0;
  }

  if (plan === 'unlimited') {
    if (type === 'upgrade') {
      log(
        `${prefix} already on the ${chalk.bold(
          'Unlimited'
        )} plan. This is the highest plan.`
      );
      log(
        `If you want to upgrade a different scope, switch to it by using ${cmd(
          'now switch'
        )} first.`
      );

      return 0;
    }
    if (type === 'downgrade') {
      log(`${prefix} on the ${chalk.bold('Unlimited')} plan.`);
      const confirmed =
        skipConfirmation ||
        (await promptBool(
          output,
          `Would you like to downgrade to the ${chalk.bold('Free')} plan?`
        ));

      if (!confirmed) {
        log(`Aborted`);
        return 0;
      }

      await downgradeToFree(output, now);
      success(
        `${prefix} now on the ${chalk.bold(
          'Free'
        )} plan. We are sad to see you go!`
      );
    }
  }

  if (plan === 'free' || plan === 'oss') {
    if (type === 'downgrade') {
      log(
        `${prefix} already on the ${chalk.bold(
          'Free'
        )} plan. This is the lowest plan.`
      );
      log(
        `If you want to downgrade a different scope, switch to it by using ${cmd(
          'now switch'
        )} first.`
      );

      return 0;
    }
    if (type === 'upgrade') {
      log(`${prefix} on the ${chalk.bold('Free')} plan.`);
      const confirmed =
        skipConfirmation ||
        (await promptBool(
          output,
          `Would you like to upgrade to the ${chalk.bold(
            'Unlimited'
          )} plan (starting at ${chalk.bold('$0.99/month')})?`
        ));

      if (!confirmed) {
        log(`Aborted`);
        return 0;
      }

      await upgradeToUnlimited(output, now);
      success(`${prefix} now on the ${chalk.bold('Unlimited')} plan. Enjoy!`);
    }
  }

  log(`${prefix} on the old ${chalk.bold(plans[plan])} plan (Now 1.0).`);

  if (type === 'upgrade') {
    const confirmed =
      skipConfirmation ||
      (await promptBool(
        output,
        `Would you like to upgrade to the new ${chalk.bold(
          'Unlimited'
        )} plan (starting at ${chalk.bold('$0.99/month')})?`
      ));

    if (!confirmed) {
      log(`Aborted`);
      return 0;
    }

    await upgradeToUnlimited(output, now);
    success(`${prefix} now on the new ${chalk.bold('Unlimited')} plan. Enjoy!`);

    return 0;
  }

  const confirmed =
    skipConfirmation ||
    (await promptBool(
      output,
      `Would you like to downgrade to the new ${chalk.bold('Free')} plan?`
    ));

  if (!confirmed) {
    log(`Aborted`);
    return 0;
  }

  await downgradeToFree(output, now);
  success(
    `${prefix} now on the new ${chalk.bold(
      'Free'
    )} plan. We are sad to see you go!`
  );
}
