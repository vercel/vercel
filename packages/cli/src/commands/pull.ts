import { writeFile } from 'fs-extra';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import { getCommandName } from '../util/pkg-name';
import {
  getLinkedProject,
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
} from '../util/projects/link';
import pull from './env/pull';

const help = () => {
  // @todo help output
  return 'vercel pull';
};
export default async function main(client: Client) {
  let argv;
  let debug;
  let yes;
  const { output } = client;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--debug': Boolean,
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }
  const cwd = argv._[1] || process.cwd();
  debug = argv['--debug'];
  yes = argv['--yes'];
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  } else {
    const { project, org } = link;
    const result = await pull(
      client,
      project,
      { '--yes': yes, '--debug': debug },
      [], // @TODO how do I get these?
      client.output
    );
    if (result != 0) {
      // an error happened
      return result;
    }

    await writeFile(
      join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT),
      JSON.stringify({
        projectId: project.id,
        orgId: org.id,
        settings: {
          buildCommand: project.buildCommand,
          devCommand: project.devCommand,
          directoryListing: project.directoryListing,
          outputDirectory: project.outputDirectory,
          rootDirectory: project.rootDirectory,
          framework: project.framework,
        },
      })
    );
  }
  return 0;
}
