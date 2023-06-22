import { join } from 'path';
import frameworks from '@vercel/frameworks';
import {
  detectFramework,
  getWorkspacePackagePaths,
  getWorkspaces,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';

export async function detectProjects(cwd: string) {
  const fs = new LocalFileSystemDetector(cwd);
  const workspaces = await getWorkspaces({ fs });
  console.log({ workspaces });
  const detectedProjects = new Map<string, string>();
  if (workspaces.length === 0) detectedProjects;
  // TODO: get package paths for all workspaces
  const packagePaths = await getWorkspacePackagePaths({
    fs,
    workspace: workspaces[0],
  });
  await Promise.all(
    packagePaths.map(async p => {
      const framework = await detectFramework({
        fs: fs.chdir(join('.', p)),
        frameworkList: frameworks,
      });
      if (!framework) return;
      detectedProjects.set(p.slice(1), framework);
    })
  );
  return detectedProjects;
}
