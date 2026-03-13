import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { addSubcommand, link2Command } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { discoverRepoProjects, findRepoRoot, RepoProjectsConfig } from '../../util/link/repo';
import { readJSON } from 'fs-extra';
import path, { join } from 'path';
import { VERCEL_DIR, VERCEL_DIR_REPO } from '../../util/projects/link';
import { isErrnoException } from '@vercel/error-utils';
import { getGitConfigPath } from '../../util/git-helpers';
import { getRemoteUrls } from '../../util/create-git-meta';
import { parseRepoUrl } from '../../util/git/connect-git-provider';
import { Project } from '@vercel-internals/types';
import { detectProjects } from '../../util/projects/detect-projects';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
};

export default async function link2(client: Client) {
  const flagsSpecification = getFlagsSpecification(link2Command.options);

  // Parse CLI args (permissive to allow subcommand flags to pass through)
  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: link2Command, columns: client.stderr.columns })
    );
  }

  if (subcommand === 'add') {
    if (parsedArgs.flags['--help']) {
      printHelp(addSubcommand);
      return 2;
    }
    // Stub: just print cwd
    output.log(`link-2 add (stub); cwd: ${client.cwd}`);
    return 0;
  }

  // Default behavior (no subcommand) - re-parse strictly
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(link2Command, { columns: client.stderr.columns }));
    return 2;
  }

  // Stub: just print cwd (implementation to come)
  output.log(`link-2 (stub); cwd: ${client.cwd}`);
  const rootPath = await findRepoRoot(client.cwd);
  // console.log({ cwd: client.cwd, rootPath });
  const projectJson = await getIfExists<RepoProjectsConfig>(join(client.cwd, VERCEL_DIR, VERCEL_DIR_REPO));
  // console.log({ projectJson, rootPath });
  if (rootPath) {
    const detectedProjects = await detectProjects(rootPath);
    console.dir(detectedProjects, { depth: null });
    if (rootPath === client.cwd) {
      // we're not in the root, so we should find the project whose rootDirectory === cwd, if we have none, act like we're in the root
    }

    const repoJson = await getIfExists<RepoProjectsConfig>(join(rootPath, VERCEL_DIR, VERCEL_DIR_REPO));
    if (repoJson) {
      if (!projectJson) {
        const project = repoJson.projects.find(p => path.normalize(p.directory) === path.normalize(client.cwd));
        if (project) {
          // console.log('project', project);
          // write the .vercel/project.json file with the projectId, orgId, and projectName
        }
      }
    } else {
      console.log('no repo json');
      const gitConfigPath =
        getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
      const remoteUrls = await getRemoteUrls(gitConfigPath);
      const remoteNames = Object.keys(remoteUrls || {});
      const remoteName = remoteNames.length > 1 ? remoteNames.find(key => key !== 'origin') : remoteNames[0];
      if (!remoteName) {
        // Prompt user to select which remote to use
        throw new Error('No remote name found');
      }
      const repoUrl = remoteUrls?.[remoteName];
      if (!repoUrl) {
        throw new Error('No repo URL found');
      }
      const query = new URLSearchParams({ repoUrl });
      const projectsIterator = client.fetchPaginated<{
        projects: Project[];
      }>(`/v9/projects?${query}`);
      for await (const chunk of projectsIterator) {
        console.dir(chunk, { depth: null });
      }
    }
    return 0;
  } else {
    // we're not in a repo, cwd is all we have to go on
  }

  async function getIfExists<T>(path: string): Promise<T | null> {
    try {
      return await readJSON(path);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }
}
