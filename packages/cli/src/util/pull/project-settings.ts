import { outputJSON } from 'fs-extra';
import { Org, Project, ProjectLink } from '../../types';
import {
  getLinkFromDir,
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
} from '../projects/link';
import { join } from 'path';
import { VercelConfig } from '@vercel/client';
import { PartialProjectSettings } from '../input/edit-project-settings';
import * as cli from '../pkg-name';
import pull from '../../commands/pull';
import confirm from '../input/confirm';
import Client from '../client';

export type ProjectLinkAndSettings = ProjectLink & {
  settings: {
    createdAt: Project['createdAt'];
    installCommand: Project['installCommand'];
    buildCommand: Project['buildCommand'];
    devCommand: Project['devCommand'];
    outputDirectory: Project['outputDirectory'];
    directoryListing: Project['directoryListing'];
    rootDirectory: Project['rootDirectory'];
    framework: Project['framework'];
    nodeVersion: Project['nodeVersion'];
    analyticsId?: string;
  };
};

// writeProjectSettings writes the project configuration to `vercel/project.json`
// Write the project configuration to `.vercel/project.json`
// that is needed for `vercel build` and `vercel dev` commands
export async function writeProjectSettings(
  cwd: string,
  project: Project,
  org: Org
) {
  let analyticsId: string | undefined;
  if (
    project.analytics?.id &&
    (!project.analytics.disabledAt ||
      (project.analytics.enabledAt &&
        project.analytics.enabledAt > project.analytics.disabledAt))
  ) {
    analyticsId = project.analytics.id;
  }

  const projectLinkAndSettings: ProjectLinkAndSettings = {
    projectId: project.id,
    orgId: org.id,
    settings: {
      createdAt: project.createdAt,
      framework: project.framework,
      devCommand: project.devCommand,
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      outputDirectory: project.outputDirectory,
      rootDirectory: project.rootDirectory,
      directoryListing: project.directoryListing,
      nodeVersion: project.nodeVersion,
      analyticsId,
    },
  };
  const path = join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT);
  return await outputJSON(path, projectLinkAndSettings, {
    spaces: 2,
  });
}

export async function readProjectSettings(cwd: string) {
  return await getLinkFromDir<ProjectLinkAndSettings>(cwd);
}

export async function ensureProjectSettings(
  client: Client,
  cwd: string,
  target: string,
  yes = false
) {
  let project = await readProjectSettings(join(cwd, VERCEL_DIR));
  const isTTY = client.stdin.isTTY;
  while (!project?.settings) {
    let confirmed = yes;
    if (!confirmed) {
      if (!isTTY) {
        client.output.print(
          `No Project Settings found locally. Run ${cli.getCommandName(
            'pull --yes'
          )} to retrieve them.`
        );
        return 1;
      }

      confirmed = await confirm(
        client,
        `No Project Settings found locally. Run ${cli.getCommandName(
          'pull'
        )} for retrieving them?`,
        true
      );
    }
    if (!confirmed) {
      client.output.print(`Canceled. No Project Settings retrieved.\n`);
      return 0;
    }
    const { argv: originalArgv } = client;
    client.argv = [
      ...originalArgv.slice(0, 2),
      'pull',
      `--environment`,
      target,
    ];
    if (yes) {
      client.argv.push('--yes');
    }
    const result = await pull(client);
    if (result !== 0) {
      return result;
    }
    client.argv = originalArgv;
    project = await readProjectSettings(join(cwd, VERCEL_DIR));
  }
  return project;
}

export function pickOverrides(
  vercelConfig: VercelConfig
): PartialProjectSettings {
  const overrides: PartialProjectSettings = {};
  for (const prop of [
    'buildCommand',
    'devCommand',
    'framework',
    'ignoreCommand',
    'installCommand',
    'outputDirectory',
  ] as const) {
    if (typeof vercelConfig[prop] !== 'undefined') {
      if (prop === 'ignoreCommand') {
        overrides.commandForIgnoringBuildStep = vercelConfig[prop];
      } else {
        overrides[prop] = vercelConfig[prop];
      }
    }
  }
  return overrides;
}
