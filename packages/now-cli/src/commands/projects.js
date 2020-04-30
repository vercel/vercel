import chalk from 'chalk';
import table from 'text-table';
import mri from 'mri';
import ms from 'ms';
import strlen from '../util/strlen';
import { handleError, error } from '../util/error';
import exit from '../util/exit';
import Client from '../util/client.ts';
import logo from '../util/output/logo';
import getScope from '../util/get-scope';
import createOutput from '../util/output';
import getCommandFlags from '../util/get-command-flags';
import cmd from '../util/output/cmd.ts';
import wait from '../util/output/wait';
import getPrefixedFlags from '../util/get-prefixed-flags';

const e = encodeURIComponent;

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
    -S, --scope                    Set a custom scope
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new project

    ${chalk.cyan('$ now projects add my-project')}

  ${chalk.gray('–')} Paginate projects, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

    ${chalk.cyan(`$ now projects ls --next 1584722256178`)}
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
      help: 'h',
      next: 'N',
    },
  });

  argv._ = argv._.slice(1);

  debug = argv.debug;
  apiUrl = ctx.apiUrl;
  subcommand = argv._[0];

  if (argv.help || !subcommand) {
    help();
    await exit(0);
  }

  const output = createOutput({ debug });

  const {
    authConfig: { token },
    config: { currentTeam },
  } = ctx;
  const client = new Client({ apiUrl, token, currentTeam, debug });

  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  try {
    await run({ client, contextName });
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

async function run({ client, contextName }) {
  const args = argv._.slice(1);
  const start = Date.now();

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now projects ls`'
          )}`
        )
      );
      return exit(1);
    }

    const stopSpinner = wait(`Fetching projects in ${chalk.bold(contextName)}`);

    let projectsUrl = '/v4/projects/?limit=20';

    if (argv.next) {
      projectsUrl += `&until=${argv.next}`;
    }

    const { projects: list, pagination } = await client.fetch(projectsUrl, {
      method: 'GET',
    });

    stopSpinner();

    const elapsed = ms(new Date() - start);

    console.log(
      `> ${
        list.length > 0 ? 'Projects' : 'No projects'
      } found under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`
    );

    if (list.length > 0) {
      const cur = Date.now();
      const header = [['', 'name', 'updated'].map(s => chalk.dim(s))];

      const out = table(
        header.concat(
          list.map(secret => [
            '',
            chalk.bold(secret.name),
            chalk.gray(`${ms(cur - new Date(secret.updatedAt))} ago`),
          ])
        ),
        {
          align: ['l', 'l', 'l'],
          hsep: ' '.repeat(2),
          stringLength: strlen,
        }
      );

      if (out) {
        console.log(`\n${out}\n`);
      }

      if (pagination && pagination.count === 20) {
        const prefixedArgs = getPrefixedFlags(argv);
        const flags = getCommandFlags(prefixedArgs, [
          '_',
          '--next',
          '-N',
          '-d',
          '-y',
        ]);
        const nextCmd = `now projects ls${flags} --next ${pagination.next}`;
        console.log(`To display the next page run ${cmd(nextCmd)}`);
      }
    }
    return;
  }

  if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now project  rm <name>`'
          )}`
        )
      );
      return exit(1);
    }

    const name = args[0];

    // Check the existence of the project
    try {
      await client.fetch(`/projects/info/${e(name)}`);
    } catch (err) {
      if (err.status === 404) {
        console.error(error('No such project exists'));
        return exit(1);
      }
    }

    const yes = await readConfirmation(name);
    if (!yes) {
      console.error(error('User abort'));
      return exit(0);
    }

    await client.fetch(`/v2/projects/${name}`, {
      method: 'DELETE',
    });
    const elapsed = ms(new Date() - start);
    console.log(
      `${chalk.cyan('> Success!')} Project ${chalk.bold(
        name
      )} removed ${chalk.gray(`[${elapsed}]`)}`
    );
    return;
  }

  if (subcommand === 'add') {
    if (args.length !== 1) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now projects add <name>`'
          )}`
        )
      );

      if (args.length > 1) {
        const example = chalk.cyan(`$ now projects add "${args.join(' ')}"`);
        console.log(
          `> If your project name  has spaces, make sure to wrap it in quotes. Example: \n  ${example} `
        );
      }

      return exit(1);
    }

    const [name] = args;
    await client.fetch('/projects/ensure-project', {
      method: 'POST',
      body: { name },
    });
    const elapsed = ms(new Date() - start);

    console.log(
      `${chalk.cyan('> Success!')} Project ${chalk.bold(
        name.toLowerCase()
      )} added (${chalk.bold(contextName)}) ${chalk.gray(`[${elapsed}]`)}`
    );
    return;
  }

  console.error(error('Please specify a valid subcommand: ls | add | rm'));
  help();
  exit(1);
}

process.on('uncaughtException', err => {
  handleError(err);
  exit(1);
});

function readConfirmation(projectName) {
  return new Promise(resolve => {
    process.stdout.write(
      `The project: ${chalk.bold(projectName)} will be removed permanently.\n` +
        `It will also delete everything under the project including deployments.\n`
    );

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
