import { join } from 'path';
import { frameworkList, Framework } from '@vercel/frameworks';
import {
  detectFrameworks,
  getWorkspacePackagePaths,
  getWorkspaces,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';

export async function detectProjects(cwd: string) {
  const fs = new LocalFileSystemDetector(cwd);
  const workspaces = await getWorkspaces({ fs, cwd });
  const detectedProjects = new Map<string, Framework[]>();
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
      const frameworks = await detectFrameworks({
        fs: fs.chdir(join('.', p)),
        frameworkList,
      });
      if (frameworks.length === 0) return;
      detectedProjects.set(p.slice(1), frameworks);
    })
  );
  return detectedProjects;
}
