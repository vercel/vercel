import { writeFile } from 'fs-extra';
import { Org, Project } from '../../types';
import { VERCEL_DIR, VERCEL_DIR_PROJECT } from './link';
import { join } from 'path';

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
        outputDirectory: project.outputDirectory,
        rootDirectory: project.rootDirectory,
        framework: project.framework,
      },
    })
  );
}
