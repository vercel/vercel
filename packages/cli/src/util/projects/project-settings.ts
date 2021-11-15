import { writeFile } from 'fs-extra';
import { Org, Project, ProjectLink } from '../../types';
import { getLinkFromDir, VERCEL_DIR, VERCEL_DIR_PROJECT } from './link';
import { join } from 'path';

export type ProjectLinkAndSettings = ProjectLink & {
  settings: {
    buildCommand: Project['buildCommand'];
    devCommand: Project['devCommand'];
    outputDirectory: Project['outputDirectory'];
    rootDirectory: Project['rootDirectory'];
    framework: Project['framework'];
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
  return await writeFile(
    join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT),
    JSON.stringify({
      projectId: project.id,
      orgId: org.id,
      settings: {
        buildCommand: project.buildCommand,
        devCommand: project.devCommand,
        directoryListing: project.directoryListing,
        rootDirectory: project.rootDirectory,
        framework: project.framework,
      },
    })
  );
}

export async function readProjectSettings(cwd: string) {
  return await getLinkFromDir<ProjectLinkAndSettings>(cwd);
}
