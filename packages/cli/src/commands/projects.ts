import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import strlen from '../util/strlen';
import getArgs from '../util/get-args';
import { handleError, error } from '../util/error';
import exit from '../util/exit';
import logo from '../util/output/logo';
import getScope from '../util/get-scope';
import getCommandFlags from '../util/get-command-flags';
import { getPkgName, getCommandName } from '../util/pkg-name';
import Client from '../util/client';
import validatePaths from '../util/validate-paths';
import { ensureLink } from '../util/link-project';
import { parseGitConfig, pluckRemoteUrl } from '../util/create-git-meta';
import {
  connectGitProvider,
  disconnectGitProvider,
  parseRepoUrl,
} from '../util/projects/connect-git-provider';
import { join } from 'path';
import { Team, User } from '../types';
import confirm from '../util/input/confirm';
import { Output } from '../util/output';

const e = encodeURIComponent;

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} projects`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls                               Show all projects in the selected team/user
    connect                          Connect a Git provider to your project
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

    ${chalk.cyan(`$ ${getPkgName()} projects add my-project`)}

  ${chalk.gray('–')} Paginate projects, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

    ${chalk.cyan(`$ ${getPkgName()} projects ls --next 1584722256178`)}
`);
};

let argv: any;
let subcommand: string | string[];

const main = async (client: Client) => {
  try {
    argv = getArgs(client.argv.slice(2), {
      '--next': Number,
      '-N': '--next',
      '--yes': Boolean,
    });
  } catch (error) {
    handleError(error);
    return exit(1);
  }

  argv._ = argv._.slice(1);

  subcommand = argv._[0] || 'list';

  if (argv['--help']) {
    help();
    return exit(2);
  }

  const { output } = client;

  let scope = null;

  try {
    scope = await getScope(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  try {
    return await run({ client, scope });
  } catch (err) {
    handleError(err);
    exit(1);
  }
};

export default async (client: Client) => {
  try {
    return await main(client);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }
};

async function run({
  client,
  scope,
}: {
  client: Client;
  scope: {
    contextName: string;
    team: Team | null;
    user: User;
  };
}) {
  const { output } = client;
  const { contextName, team } = scope;
  const args = argv._.slice(1);

  const start = Date.now();

  if (subcommand === 'connect') {
    const yes = Boolean(argv['--yes']);
    if (args.length !== 0) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('projects connect')}`
          )}`
        )
      );
      return exit(2);
    }

    let paths = [process.cwd()];

    const validate = await validatePaths(output, paths);
    if (!validate.valid) {
      return validate.exitCode;
    }
    const { path } = validate;

    const linkedProject = await ensureLink(
      'projects connect',
      client,
      path,
      yes
    );
    if (typeof linkedProject === 'number') {
      return linkedProject;
    }

    const { project, org } = linkedProject;
    const gitProviderLink = project.link;

    client.config.currentTeam = org.type === 'team' ? org.id : undefined;

    // get project from .git
    const gitConfigPath = join(path, '.git/config');
    const gitConfig = await parseGitConfig(gitConfigPath, output);
    if (!gitConfig) {
      output.error(
        `No local git repo found. Run ${chalk.cyan(
          '`git clone <url>`'
        )} to clone a remote Git repository first.`
      );
      return 1;
    }
    const remoteUrl = pluckRemoteUrl(gitConfig);
    if (!remoteUrl) {
      output.error(
        `No remote origin url found in your Git config. Make sure you've connected your local Git repo to a Git provider first.`
      );
      return 1;
    }
    const parsedUrl = parseRepoUrl(remoteUrl);
    if (!parsedUrl) {
      output.error(
        `Can't parse Git repo data from the following remote url in your Git config: ${remoteUrl}`
      );
      return 1;
    }
    const { provider, org: gitOrg, repo } = parsedUrl;
    const repoPath = `${gitOrg}/${repo}`;
    let connectedRepoPath;

    if (!gitProviderLink) {
      const connect = await connectGitProvider(
        client,
        team,
        project.id,
        provider,
        repoPath
      );
      if (typeof connect === 'number') return connect;
    } else {
      const connectedProvider = gitProviderLink.type;
      const connectedOrg = gitProviderLink.org;
      const connectedRepo = gitProviderLink.repo;
      connectedRepoPath = `${connectedOrg}/${connectedRepo}`;

      const isSameRepo =
        connectedProvider === provider &&
        connectedOrg === gitOrg &&
        connectedRepo === repo;
      if (isSameRepo) {
        output.log(
          `${chalk.cyan(
            connectedRepoPath
          )} is already connected to your project.`
        );
        return 1;
      }

      const shouldReplaceRepo = await confirmRepoConnect(
        output,
        yes,
        connectedRepoPath
      );
      if (!shouldReplaceRepo) {
        return 0;
      }

      await disconnectGitProvider(client, team, project.id);
      await connectGitProvider(client, team, project.id, provider, repoPath);
    }

    output.log(`Connected ${chalk.cyan(repoPath)}!`);

    return 0;
  }

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('projects ls')}`
          )}`
        )
      );
      return exit(2);
    }

    output.spinner(`Fetching projects in ${chalk.bold(contextName)}`);

    let projectsUrl = '/v4/projects/?limit=20';

    const next = argv['--next'];
    if (next) {
      projectsUrl += `&until=${next}`;
    }

    const {
      projects: list,
      pagination,
    }: {
      projects: [{ name: string; updatedAt: number }];
      pagination: { count: number; next: number };
    } = await client.fetch(projectsUrl, {
      method: 'GET',
    });

    output.stopSpinner();

    const elapsed = ms(Date.now() - start);

    console.log(
      `> ${
        list.length > 0 ? 'Projects' : 'No projects'
      } found under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`
    );

    if (list.length > 0) {
      const cur = Date.now();
      const header = [['', 'name', 'updated'].map(title => chalk.dim(title))];

      const out = table(
        header.concat(
          list.map(secret => [
            '',
            chalk.bold(secret.name),
            chalk.gray(`${ms(cur - secret.updatedAt)} ago`),
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
        const flags = getCommandFlags(argv, ['_', '--next', '-N', '-d', '-y']);
        const nextCmd = `projects ls${flags} --next ${pagination.next}`;
        console.log(`To display the next page run ${getCommandName(nextCmd)}`);
      }
    }
    return;
  }

  if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('project rm <name>')}`
          )}`
        )
      );
      return exit(1);
    }

    const name = args[0];

    const yes = await readConfirmation(name);
    if (!yes) {
      console.error(error('User abort'));
      return exit(0);
    }

    try {
      await client.fetch(`/v2/projects/${e(name)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      if (err.status === 404) {
        console.error(error('No such project exists'));
        return exit(1);
      }
    }
    const elapsed = ms(Date.now() - start);
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
            `${getCommandName('projects add <name>')}`
          )}`
        )
      );

      if (args.length > 1) {
        const example = chalk.cyan(
          `${getCommandName(`projects add "${args.join(' ')}"`)}`
        );
        console.log(
          `> If your project name  has spaces, make sure to wrap it in quotes. Example: \n  ${example} `
        );
      }

      return exit(1);
    }

    const [name] = args;
    try {
      await client.fetch('/projects', {
        method: 'POST',
        body: { name },
      });
    } catch (error) {
      if (error.status === 409) {
        // project already exists, so we can
        // show a success message
      } else {
        throw error;
      }
    }
    const elapsed = ms(Date.now() - start);

    console.log(
      `${chalk.cyan('> Success!')} Project ${chalk.bold(
        name.toLowerCase()
      )} added (${chalk.bold(contextName)}) ${chalk.gray(`[${elapsed}]`)}`
    );
    return;
  }

  console.error(
    error('Please specify a valid subcommand: ls | connect | add | rm')
  );
  help();
  exit(2);
}

process.on('uncaughtException', err => {
  handleError(err);
  exit(1);
});

async function confirmRepoConnect(
  output: Output,
  yes: boolean,
  connectedRepoPath: string
) {
  let shouldReplaceProject = yes;
  if (!shouldReplaceProject) {
    shouldReplaceProject = await confirm(
      `Looks like you already have a repository connected: ${chalk.cyan(
        connectedRepoPath
      )}. Do you want to replace it?`,
      true
    );
    if (!shouldReplaceProject) {
      output.log(`Aborted. Repo not connected.`);
    }
  }
  return shouldReplaceProject;
}

function readConfirmation(projectName: string) {
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
        resolve(d.toString().trim().toLowerCase() === 'y');
      })
      .resume();
  });
}
