import { join } from 'path';
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import humanizePath from '../../util/humanize-path';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import {
  getLinkFromDir,
  getVercelDirectory,
  VERCEL_DIR_PROJECT,
  VERCEL_DIR_REPO,
} from '../../util/projects/link';
import { getRepoLink } from '../../util/link/repo';
import type { ProjectLink } from '@vercel-internals/types';

type InspectResult =
  | {
      status: 'linked';
      type: 'directory';
      cwd: string;
      project: {
        id: string;
        name?: string;
      };
      orgId: string;
      configPath: string;
    }
  | {
      status: 'repo_linked';
      type: 'repository';
      cwd: string;
      repoRoot: string;
      configPath: string;
      projects: {
        id: string;
        name: string;
        directory: string;
        orgId?: string;
      }[];
    }
  | {
      status: 'not_linked';
      type: 'none';
      cwd: string;
    };

function printField(label: string, value: string) {
  output.print(`  ${chalk.gray(label.padEnd(10))} ${value}\n`);
}

function printJson(client: Client, result: InspectResult) {
  client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export default async function inspectLink(
  client: Client,
  { json = false }: { json?: boolean } = {}
): Promise<number> {
  const cwd = client.cwd;
  const vercelDirectory = getVercelDirectory(cwd);
  const directoryLink = await getLinkFromDir<ProjectLink>(vercelDirectory);

  if (directoryLink) {
    const result: InspectResult = {
      status: 'linked',
      type: 'directory',
      cwd,
      project: {
        id: directoryLink.projectId,
        name: directoryLink.projectName,
      },
      orgId: directoryLink.orgId,
      configPath: join(vercelDirectory, VERCEL_DIR_PROJECT),
    };

    if (json) {
      printJson(client, result);
      return 0;
    }

    output.print(
      `${prependEmoji(
        `Linked Project found for ${param(humanizePath(cwd))}`,
        emoji('success')
      )}\n\n`
    );
    printField(
      'Project',
      chalk.bold(directoryLink.projectName || directoryLink.projectId)
    );
    printField('Project ID', chalk.cyan(directoryLink.projectId));
    printField('Org ID', chalk.cyan(directoryLink.orgId));
    printField(
      'Config',
      chalk.dim(humanizePath(join(vercelDirectory, VERCEL_DIR_PROJECT)))
    );
    return 0;
  }

  const repoLink = await getRepoLink(client, cwd);
  if (!repoLink?.repoConfig) {
    const result: InspectResult = {
      status: 'not_linked',
      type: 'none',
      cwd,
    };

    if (json) {
      printJson(client, result);
      return 1;
    }

    output.print(
      `${prependEmoji(
        `No Vercel Project link found for ${param(humanizePath(cwd))}`,
        emoji('warning')
      )}\n`
    );
    return 1;
  }

  const result: InspectResult = {
    status: 'repo_linked',
    type: 'repository',
    cwd,
    repoRoot: repoLink.rootPath,
    configPath: join(repoLink.rootPath, '.vercel', VERCEL_DIR_REPO),
    projects: repoLink.repoConfig.projects.map(project => ({
      id: project.id,
      name: project.name,
      directory: project.directory,
      orgId: project.orgId ?? repoLink.repoConfig?.orgId,
    })),
  };

  if (json) {
    printJson(client, result);
    return 0;
  }

  output.print(
    `${prependEmoji(
      `No directory Project link found for ${param(humanizePath(cwd))}`,
      emoji('warning')
    )}\n\n`
  );
  output.print(
    `${prependEmoji(
      `Repository link found at ${param(humanizePath(repoLink.rootPath))}`,
      emoji('link')
    )}\n`
  );
  printField(
    'Config',
    chalk.dim(humanizePath(join(repoLink.rootPath, '.vercel', VERCEL_DIR_REPO)))
  );
  output.print(`\n${chalk.bold('Linked repository projects')}\n`);

  for (const project of repoLink.repoConfig.projects) {
    output.print(`\n  ${chalk.bold(project.name || project.id)}\n`);
    output.print(
      `    ${chalk.gray('Directory'.padEnd(10))} ${project.directory}\n`
    );
    output.print(
      `    ${chalk.gray('Project ID'.padEnd(10))} ${chalk.cyan(project.id)}\n`
    );
    if (project.orgId || repoLink.repoConfig.orgId) {
      output.print(
        `    ${chalk.gray('Org ID'.padEnd(10))} ${chalk.cyan(
          project.orgId ?? repoLink.repoConfig.orgId
        )}\n`
      );
    }
  }

  return 0;
}
