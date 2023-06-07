import { outputJSON } from 'fs-extra';
import { Org, Project, ProjectLink } from '@vercel-internals/types';
import { getLinkFromDir, VERCEL_DIR, VERCEL_DIR_PROJECT } from './link';
import { join } from 'path';
import { VercelConfig } from '@vercel/client';
import { PartialProjectSettings } from '../input/edit-project-settings';

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
