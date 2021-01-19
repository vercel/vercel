import { stringify as stringifyQuery } from 'querystring';
import fetch from 'node-fetch';
import debugFactory from 'debug';
import promptEmail from 'email-prompt';
import ms from 'ms';
import { validate as validateEmail } from 'email-validator';
import chalk from 'chalk';
import ua from '../util/ua.ts';
import getArgs from '../util/get-args';
import error from '../util/output/error';
import highlight from '../util/output/highlight';
import ok from '../util/output/ok';
import param from '../util/output/param.ts';
import eraseLines from '../util/output/erase-lines';
import sleep from '../util/sleep';
import { handleError } from '../util/error';
import { writeToAuthConfigFile, writeToConfigFile } from '../util/config/files';
import getGlobalPathConfig from '../util/config/global-path';
import hp from '../util/humanize-path';
import logo from '../util/output/logo';
import exit from '../util/exit';
import executeLogin from '../util/login/login.ts';
import { prependEmoji, emoji } from '../util/emoji';
import { getCommandName, getPkgName } from '../util/pkg-name.ts';

const debug = debugFactory(`${getPkgName()}:login`);

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} login`)} <email>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Log into the Vercel platform

    ${chalk.cyan(`$ ${getPkgName()} login`)}

  ${chalk.gray('–')} Log in using a specific email address

    ${chalk.cyan(`$ ${getPkgName()} login john@doe.com`)}
`);
};

const verify = async ({ apiUrl, email, verificationToken }) => {
  const query = {
    email,
    token: verificationToken,
  };

  debug('GET /now/registration/verify');

  let res;

  try {
    res = await fetch(
      `${apiUrl}/now/registration/verify?${stringifyQuery(query)}`,
      {
        headers: { 'User-Agent': ua },
      }
    );
  } catch (err) {
    debug(`error fetching /now/registration/verify: $O`, err.stack);

    throw new Error(
      error(
        `An unexpected error occurred while trying to verify your login: ${err.message}`
      )
    );
  }

  debug('parsing response from GET /now/registration/verify');
  let body;

  try {
    body = await res.json();
  } catch (err) {
    debug(
      `error parsing the response from /now/registration/verify: $O`,
      err.stack
    );
    throw new Error(
      error(
        `An unexpected error occurred while trying to verify your login: ${err.message}`
      )
    );
  }

  return body.token;
};

const readEmail = async () => {
  let email;

  try {
    email = await promptEmail({ start: `Enter your email: ` });
  } catch (err) {
    console.log(); // \n

    if (err.message === 'User abort') {
      throw new Error(`${chalk.red('Aborted!')} No changes made`);
    }

    if (err.message === 'stdin lacks setRawMode support') {
      throw new Error(
        error(
          `Interactive mode not supported – please run ${getCommandName(
            `login you@domain.com`
          )}`
        )
      );
    }
  }

  console.log(); // \n
  return email;
};

const login = async ctx => {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv.help) {
    help();
    await exit(0);
  }

  const { apiUrl, output } = ctx;

  argv._ = argv._.slice(1);

  let email;
  let emailIsValid = false;

  const possibleAddress = argv._[0];

  // if the last arg is not the command itself, then maybe it's an email
  if (possibleAddress) {
    if (!validateEmail(possibleAddress)) {
      // if it's not a valid email, let's just error
      console.log(error(`Invalid email: ${param(possibleAddress)}.`));
      return 1;
    }

    // valid email, no need to prompt the user
    email = possibleAddress;
  } else {
    do {
      try {
        email = await readEmail();
      } catch (err) {
        let erase = '';
        if (err.message.includes('Aborted')) {
          // no need to keep the prompt if the user `ctrl+c`ed
          erase = eraseLines(2);
        }
        console.log(erase + err.message);
        return 1;
      }
      emailIsValid = validateEmail(email);
      if (!emailIsValid) {
        // let's erase the `> Enter email [...]`
        // we can't use `console.log()` because it appends a `\n`
        // we need this check because `email-prompt` doesn't print
        // anything if there's no TTY
        process.stdout.write(eraseLines(2));
      }
    } while (!emailIsValid);
  }

  let verificationToken;
  let securityCode;

  output.spinner('Sending you an email');

  try {
    const data = await executeLogin(apiUrl, email);
    verificationToken = data.token;
    securityCode = data.securityCode;
  } catch (err) {
    output.error(err.message);
    return 1;
  }

  output.stopSpinner();

  // Clear up `Sending email` success message
  process.stdout.write(eraseLines(possibleAddress ? 1 : 2));

  output.print(
    `We sent an email to ${highlight(
      email
    )}. Please follow the steps provided inside it and make sure the security code matches ${highlight(
      securityCode
    )}.\n`
  );

  output.spinner('Waiting for your confirmation');

  let token;

  while (!token) {
    try {
      await sleep(ms('1s'));
      token = await verify({ apiUrl, email, verificationToken });
    } catch (err) {
      if (/invalid json response body/.test(err.message)) {
        // /now/registraton is currently returning plain text in that case
        // we just wait for the user to click on the link
      } else {
        output.error(err.message);
        return 1;
      }
    }
  }

  output.stopSpinner();
  console.log(ok('Email confirmed'));

  // There's no need to save the user since we always
  // pull the user data fresh from the server.
  ctx.authConfig.token = token;

  // New user, so we can't keep the team
  delete ctx.config.currentTeam;

  writeToAuthConfigFile(ctx.authConfig);
  writeToConfigFile(ctx.config);

  output.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

  console.log(
    `${chalk.cyan('Congratulations!')} ` +
      `You are now logged in. In order to deploy something, run ${getCommandName()}.`
  );

  output.print(
    `${prependEmoji(
      `Connect your Git Repositories to deploy every branch push automatically (https://vercel.link/git).`,
      emoji('tip')
    )}\n`
  );

  return ctx;
};

export default login;
