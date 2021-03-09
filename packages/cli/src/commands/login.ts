import inquirer from 'inquirer';
import { validate as validateEmail } from 'email-validator';
import chalk from 'chalk';
import getArgs from '../util/get-args';
import error from '../util/output/error';
import handleError from '../util/handle-error';
import logo from '../util/output/logo';
import doSsoLogin from '../util/login/sso';
import doEmailLogin from '../util/login/email';
import { getCommandName, getPkgName } from '../util/pkg-name';
import { NowContext } from '../types';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} login`)} <email or team>

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

  ${chalk.gray('–')} Log in using a specific team "slug" for SAML Single Sign-On

    ${chalk.cyan(`$ ${getPkgName()} login acme`)}
`);
};

const readInput = async () => {
  let input;

  while (!input) {
    try {
      const { val } = await inquirer.prompt({
        type: 'input',
        name: 'val',
        message: 'Enter your email or team slug:',
      });
      input = val;
    } catch (err) {
      console.log(); // \n

      if (err.isTtyError) {
        throw new Error(
          error(
            `Interactive mode not supported – please run ${getCommandName(
              `login you@domain.com`
            )}`
          )
        );
      }
    }
  }

  console.log(); // \n
  return input;
};

export default async function login(ctx: NowContext): Promise<number> {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const { apiUrl, output } = ctx;

  const input = argv._[1] || (await readInput());

  // if the last arg is not the command itself, then maybe it's an email
  /*
  if (possibleAddress) {
    if (!validateEmail(possibleAddress)) {
      // if it's not a valid email, let's just error
      console.log(error(`Invalid email: ${param(possibleAddress)}.`));
      return 1;
    }

    // valid email, no need to prompt the user
    email = possibleAddress;
  } else {
    let emailIsValid = false;
    while (!emailIsValid) {
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
    }
  }
  */

  // TODO: add proper validation
  const isValidSlug = true;

  if (validateEmail(input)) {
    return doEmailLogin(input, { output, apiUrl, ctx });
  } else if (isValidSlug) {
    return doSsoLogin(input, { output, apiUrl, ctx });
  } else {
    output.error(`Invalid input: "${input}"`);
    output.log(`Please enter a valid email address or team slug`);
    return 2;
  }
}
