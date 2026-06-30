import { join } from 'path';
import {
  frameworkList,
  type Runtime,
  type Framework,
} from '@vercel/frameworks';
import {
  detectFrameworks,
  detectRuntime,
  getWorkspacePackagePaths,
  getWorkspaces,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';

export interface DetectedProject {
  framework: Framework;
  /**
   * The runtime resolved for the framework's language. `undefined` when the
   * framework has no `language` (e.g. the "Other" preset) and runtime
   * detection is therefore skipped.
   */
  runtime: Runtime | undefined;
}

export async function detectProjects(
  cwd: string
): Promise<Map<string, DetectedProject[]>> {
  const fs = new LocalFileSystemDetector(cwd);
  const workspaces = await getWorkspaces({ fs });
  const detectedProjects = new Map<string, DetectedProject[]>();
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
      const packageFs = fs.chdir(join('.', p));
      const frameworks = await detectFrameworks({
        fs: packageFs,
        frameworkList,
      });
      if (frameworks.length === 0) return;

      const languages = [...new Set(frameworks.map(f => f.language))];
      const runtimes = new Map(
        await Promise.all(
          languages.map(
            async language =>
              [
                language,
                language
                  ? await detectRuntime({ fs: packageFs, language })
                  : undefined,
              ] as const
          )
        )
      );

      detectedProjects.set(
        p.slice(1),
        frameworks.map(framework => ({
          framework,
          runtime: runtimes.get(framework.language),
        }))
      );
    })
  );
  return detectedProjects;
}
