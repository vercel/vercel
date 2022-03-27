import { writeJSON } from 'fs-extra';
import { Org, Project, ProjectLink } from '../../types';
import { getLinkFromDir, VERCEL_DIR, VERCEL_DIR_PROJECT } from './link';
import { join } from 'path';

export type ProjectLinkAndSettings = ProjectLink & {
  settings: {
    installCommand: Project['installCommand'];
    buildCommand: Project['buildCommand'];
    devCommand: Project['devCommand'];
    outputDirectory: Project['outputDirectory'];
    directoryListing: Project['directoryListing'];
    rootDirectory: Project['rootDirectory'];
    framework: Project['framework'];
    nodeVersion: Project['nodeVersion'];
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
  const path = join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT);
  const projectLinkAndSettings: ProjectLinkAndSettings = {
    projectId: project.id,
    orgId: org.id,
    settings: {
      framework: project.framework,
      devCommand: project.devCommand,
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      outputDirectory: project.outputDirectory,
      rootDirectory: project.rootDirectory,
      directoryListing: project.directoryListing,
      nodeVersion: project.nodeVersion,
    },
  };
  return await writeJSON(path, projectLinkAndSettings, { spaces: 2 });
}

export async function readProjectSettings(cwd: string) {
  return await getLinkFromDir<ProjectLinkAndSettings>(cwd);
}
