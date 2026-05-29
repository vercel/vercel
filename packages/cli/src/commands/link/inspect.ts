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

function printField(label: string, value: string) {
  output.print(`  ${chalk.gray(label.padEnd(10))} ${value}\n`);
}

export default async function inspectLink(client: Client): Promise<number> {
  const cwd = client.cwd;
  const vercelDirectory = getVercelDirectory(cwd);
  const directoryLink = await getLinkFromDir<ProjectLink>(vercelDirectory);

  if (directoryLink) {
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
    output.print(
      `  ${chalk.gray('Config'.padEnd(10))} ${chalk.dim(
        humanizePath(join(vercelDirectory, VERCEL_DIR_PROJECT))
      )}\n`
    );
    return 0;
  }

  const repoLink = await getRepoLink(client, cwd);
  if (!repoLink?.repoConfig) {
    output.print(
      `${prependEmoji(
        `No Vercel Project link found for ${param(humanizePath(cwd))}`,
        emoji('warning')
      )}\n`
    );
    return 1;
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
  output.print(
    `  ${chalk.gray('Config'.padEnd(10))} ${chalk.dim(
      humanizePath(join(repoLink.rootPath, '.vercel', VERCEL_DIR_REPO))
    )}\n`
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
