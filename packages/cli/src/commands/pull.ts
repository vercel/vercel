import { writeFile } from 'fs-extra';
import { join } from 'path';
import { ProjectLinkResult } from '../types';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import setupAndLink from '../util/link/setup-and-link';
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
  let yes;
  let link: ProjectLinkResult;
  try {
    argv = getArgs(client.argv.slice(2), {
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
  yes = argv['--yes'];

  link = await getLinkedProject(client);
  if (link.status === 'not_linked') {
    link = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      successEmoji: 'link',
      setupMsg: 'Set up',
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    return link.exitCode;
  }

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

  return 0;
}
