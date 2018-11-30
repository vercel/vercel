import chalk from 'chalk';
import table from 'text-table';
import mri from 'mri';
import ms from 'ms';
import plural from 'pluralize';
import strlen from '../util/strlen';
import { handleError, error } from '../util/error';
import NowSecrets from '../util/secrets';
import exit from '../util/exit';
import logo from '../util/output/logo';
import getScope from '../util/get-scope';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now secrets`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls                               Show all secrets in a list
    add      [name] [value]          Add a new secret
    rename   [old-name] [new-name]   Change the name of a secret
    rm       [name]                  Remove a secret

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
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new secret

    ${chalk.cyan('$ now secrets add my-secret "my value"')}

    ${chalk.gray(
      '–'
    )} Once added, a secret's value can't be retrieved in plain text anymore
    ${chalk.gray(
      '–'
    )} If the secret's value is more than one word, wrap it in quotes
    ${chalk.gray('–')} When in doubt, always wrap your value in quotes

  ${chalk.gray(
    '–'
  )} Expose a secret as an environment variable (notice the ${chalk.cyan.bold(
    '`@`'
  )} symbol)

    ${chalk.cyan(`$ now -e MY_SECRET=${chalk.bold('@my-secret')}`)}
`);
};

// Options
let argv;
let debug;
let apiUrl;
let subcommand;

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  });

  argv._ = argv._.slice(1);

  debug = argv.debug;
  apiUrl = ctx.apiUrl;
  subcommand = argv._[0];

  if (argv.help || !subcommand) {
    help();
    await exit(0);
  }

  const { authConfig: { token }, config: { currentTeam }} = ctx;

  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  try {
    await run({ token, contextName, currentTeam });
  } catch (err) {
    handleError(err);
    exit(1);
  }
};

export default async ctx => {
  try {
    await main(ctx);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }
};

async function run({ token, contextName, currentTeam }) {
  const secrets = new NowSecrets({ apiUrl, token, debug, currentTeam });
  const args = argv._.slice(1);
  const start = Date.now();

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan('`now secret ls`')}`
        )
      );
      return exit(1);
    }

    const list = await secrets.ls();
    const elapsed = ms(new Date() - start);

    console.log(
      `> ${plural('secret', list.length, true)} found under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`
    );

    if (list.length > 0) {
      const cur = Date.now();
      const header = [['', 'name', 'created'].map(s => chalk.dim(s))];
      const out = table(
        header.concat(
          list.map(secret => [
              '',
              chalk.bold(secret.name),
              chalk.gray(`${ms(cur - new Date(secret.created))  } ago`)
            ])
        ),
        {
          align: ['l', 'l', 'l'],
          hsep: ' '.repeat(2),
          stringLength: strlen
        }
      );

      if (out) {
        console.log(`\n${  out  }\n`);
      }
    }
    return secrets.close();
  }

  if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now secret rm <name>`'
          )}`
        )
      );
      return exit(1);
    }
    const list = await secrets.ls();
    const theSecret = list.find(secret => secret.name === args[0]);

    if (theSecret) {
      const yes = await readConfirmation(theSecret);
      if (!yes) {
        console.error(error('User abort'));
        return exit(0);
      }
    } else {
      console.error(error(`No secret found by name "${args[0]}"`));
      return exit(1);
    }

    const secret = await secrets.rm(args[0]);
    const elapsed = ms(new Date() - start);
    console.log(
      `${chalk.cyan('> Success!')} Secret ${chalk.bold(
        secret.name
      )} removed ${chalk.gray(`[${elapsed}]`)}`
    );
    return secrets.close();
  }

  if (subcommand === 'rename') {
    if (args.length !== 2) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now secret rename <old-name> <new-name>`'
          )}`
        )
      );
      return exit(1);
    }
    const secret = await secrets.rename(args[0], args[1]);
    const elapsed = ms(new Date() - start);
    console.log(
      `${chalk.cyan('> Success!')} Secret ${chalk.bold(
        secret.oldName
      )} renamed to ${chalk.bold(args[1])} ${chalk.gray(`[${elapsed}]`)}`
    );
    return secrets.close();
  }

  if (subcommand === 'add' || subcommand === 'set') {
    if (args.length !== 2) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now secret add <name> <value>`'
          )}`
        )
      );

      if (args.length > 2) {
        const example = chalk.cyan(`$ now secret add ${args[0]}`);
        console.log(
          `> If your secret has spaces, make sure to wrap it in quotes. Example: \n  ${example} `
        );
      }

      return exit(1);
    }

    const [name, value] = args;
    await secrets.add(name, value);
    const elapsed = ms(new Date() - start);

    console.log(
      `${chalk.cyan('> Success!')} Secret ${chalk.bold(
        name.toLowerCase()
      )} added (${chalk.bold(contextName)}) ${chalk.gray(`[${elapsed}]`)}`
    );
    return secrets.close();
  }

  console.error(
    error('Please specify a valid subcommand: ls | add | rename | rm')
  );
  help();
  exit(1);
}

process.on('uncaughtException', err => {
  handleError(err);
  exit(1);
});

function readConfirmation(secret) {
  return new Promise(resolve => {
    const time = chalk.gray(`${ms(new Date() - new Date(secret.created))  } ago`);
    const tbl = table([[chalk.bold(secret.name), time]], {
      align: ['r', 'l'],
      hsep: ' '.repeat(6)
    });

    process.stdout.write(
      '> The following secret will be removed permanently\n'
    );
    process.stdout.write(`  ${  tbl  }\n`);

    process.stdout.write(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    );

    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(
          d
            .toString()
            .trim()
            .toLowerCase() === 'y'
        );
      })
      .resume();
  });
}
