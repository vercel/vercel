import { join, basename } from 'path';
import chalk from 'chalk';
import { NowContext } from '../../types';
import createOutput from '../../util/output';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import {
  getLinkedProject,
  linkFolderToProject,
} from '../../util/projects/link';
import Client from '../../util/client';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import { getPkgName } from '../../util/pkg-name';
import confirm from '../../util/input/confirm';
import toHumanPath from '../../util/humanize-path';
import { isDirectory } from '../../util/config/global-path';
import selectOrg from '../../util/input/select-org';
import inputProject from '../../util/input/input-project';
import { validateRootDirectory } from '../../util/validate-paths';
import { inputRootDirectory } from '../../util/input/input-root-directory';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} link`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Link current directory to a Vercel Project

      ${chalk.cyan(`$ ${getPkgName()} link`)}
`);
};

const COMMAND_CONFIG = {
  // No subcommands yet
};

export default async function main(ctx: NowContext) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const debug = argv['--debug'];
  const output = createOutput({ debug });
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const client = new Client({ apiUrl, token, currentTeam, debug });
  //client.currentTeam = org.type === 'team' ? org.id : undefined;

  const pathDir = args[0] || process.cwd();
  if (!isDirectory(pathDir)) {
    output.error(`Expected directory but found file: ${pathDir}`);
    return 1;
  }
  const link = await getLinkedProject(output, client, pathDir);
  const autoConfirm = false;
  const isFile = false;
  let rootDirectory = null;
  let newProjectName = null;
  let project = null;
  let org;

  if (link.status === 'linked') {
    link.project;
    output.note('Project is already linked');
    // TODO: delete project first?
    return 0;
  }

  const shouldStartSetup =
    autoConfirm ||
    (await confirm(
      `Set up and deploy ${chalk.cyan(`“${toHumanPath(pathDir)}”`)}?`,
      true
    ));

  if (!shouldStartSetup) {
    output.print(`Aborted. Project not set up.\n`);
    return 0;
  }

  try {
    org = await selectOrg(
      output,
      'Which scope do you want to deploy to?',
      client,
      ctx.config.currentTeam,
      autoConfirm
    );
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const detectedProjectName = basename(pathDir);

  const projectOrNewProjectName = await inputProject(
    output,
    client,
    org,
    detectedProjectName,
    autoConfirm
  );

  console.log({ projectOrNewProjectName }); // todo: remove

  if (typeof projectOrNewProjectName === 'string') {
    newProjectName = projectOrNewProjectName;
    rootDirectory = await inputRootDirectory(pathDir, output, autoConfirm);
  } else {
    project = projectOrNewProjectName;

    await linkFolderToProject(
      output,
      pathDir,
      {
        projectId: project.id,
        orgId: org.id,
      },
      project.name,
      org.slug
    );
    return 0;
  }
  /*
    const sourcePath = rootDirectory ? join(pathDir, rootDirectory) : pathDir;

    if (
      (await validateRootDirectory(
        output,
        pathDir,
        sourcePath,
        project
          ? `To change your Project Settings, go to https://vercel.com/${org.slug}/${project.name}/settings`
          : ''
      )) === false
    ) {
      return 1;
    }
    */
}
