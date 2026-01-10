import type { Runtime, FrameworkDetectionItem } from '@vercel/frameworks';
import type { DetectorFilesystem } from './detectors/filesystem';

export interface DetectRuntimeOptions {
  fs: DetectorFilesystem;
  runtimeList: readonly Runtime[];
}

async function checkDetector(
  fs: DetectorFilesystem,
  runtime: Runtime,
  detector: FrameworkDetectionItem
): Promise<boolean> {
  let { path, matchContent } = detector;
  const { matchPackage } = detector;

  if (matchPackage && matchContent) {
    throw new Error(
      `Cannot specify "matchPackage" and "matchContent" in the same detector for runtime "${runtime.slug}"`
    );
  }

  if (matchPackage && path) {
    throw new Error(
      `Cannot specify "matchPackage" and "path" in the same detector for runtime "${runtime.slug}" because "path" is assumed to be "package.json".`
    );
  }

  if (!path && !matchPackage) {
    throw new Error(
      `Must specify either "path" or "matchPackage" in detector for runtime "${runtime.slug}".`
    );
  }

  if (!path) {
    path = 'package.json';
  }

  if (matchPackage) {
    matchContent = `"(dev)?(d|D)ependencies":\\s*{[^}]*"${matchPackage}":\\s*"(.+?)"[^}]*}`;
  }

  if ((await fs.hasPath(path)) === false) {
    return false;
  }

  if (matchContent) {
    if ((await fs.isFile(path)) === false) {
      return false;
    }

    const regex = new RegExp(matchContent, 'm');
    const content = await fs.readFile(path);

    if (!regex.test(content.toString())) {
      return false;
    }
  }

  return true;
}

async function matchesRuntime(
  fs: DetectorFilesystem,
  runtime: Runtime
): Promise<boolean> {
  const detectors = runtime.detectors;

  if (!detectors) {
    return false;
  }

  const { every, some } = detectors;

  if (every !== undefined && !Array.isArray(every)) {
    return false;
  }

  if (some !== undefined && !Array.isArray(some)) {
    return false;
  }

  if (every) {
    for (const detector of every) {
      const ok = await checkDetector(fs, runtime, detector);
      if (!ok) {
        return false;
      }
    }
  }

  if (some) {
    let matchedSome = false;
    for (const detector of some) {
      if (await checkDetector(fs, runtime, detector)) {
        matchedSome = true;
        break;
      }
    }

    if (!matchedSome) {
      return false;
    }
  }

  return true;
}

export async function detectRuntime({
  fs,
  runtimeList,
}: DetectRuntimeOptions): Promise<Runtime | null> {
  const results = await Promise.all(
    runtimeList.map(async runtime => {
      if (await matchesRuntime(fs, runtime)) {
        return runtime;
      }
      return null;
    })
  );

  const runtime = results.find(r => r !== null) as Runtime | null | undefined;
  return runtime ?? null;
}
