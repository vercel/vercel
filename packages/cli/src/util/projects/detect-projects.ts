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
  const detectedProjects = new Map<string, string>();
  const packagePaths = (
    await Promise.all(
      workspaces.map(workspace =>
        getWorkspacePackagePaths({
          fs,
          workspace,
        })
      )
    )
  ).flat();
  if (packagePaths.length === 0) {
    packagePaths.push('/');
  }
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
