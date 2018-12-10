import chalk from 'chalk';
import table from 'text-table';
import mri from 'mri';
import ms from 'ms';
import plural from 'pluralize';
import strlen from '../util/strlen';
import { handleError, error } from '../util/error';
import ZeitAgent from '../util/zeit-agent';
import exit from '../util/exit';
import logo from '../util/output/logo';
import getScope from '../util/get-scope';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now projects`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls                               Show all projects in the selected team/user
    add      [name]                  Add a new project
    rm       [name]                  Remove a project

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new project

    ${chalk.cyan('$ now projects add my-project')}
`);
};

// Options
let argv;
let debug;
let apiUrl;
let subcommand;

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help'],
    alias: {
      help: 'h'
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
  const secrets = {};
  const agent = new ZeitAgent('https://api-projects.zeit.sh', {token, teamId: currentTeam});
  const args = argv._.slice(1);
  const start = Date.now();

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan('`now projects ls`')}`
        )
      );
      return exit(1);
    }

    const list = await agent.fetchAndThrow('/list', {method: 'GET'});
    const elapsed = ms(new Date() - start);

    console.log(
      `> ${plural('project', list.length, true)} found under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`
    );

    if (list.length > 0) {
      const cur = Date.now();
      const header = [['', 'name', 'updated'].map(s => chalk.dim(s))];
      const out = table(
        header.concat(
          list.map(secret => [
              '',
              chalk.bold(secret.name),
              chalk.gray(`${ms(cur - new Date(secret.updatedAt))  } ago`)
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
    return agent.close();
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
    error('Please specify a valid subcommand: ls | add | rm')
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
