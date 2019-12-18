import { FrameworkDetectionItem } from './types';
import { DetectorFilesystem } from './detectors/filesystem';

export interface DetectFrameworkOptions {
  fs: DetectorFilesystem;
  frameworkList: FrameworkDetectionItem[];
}

async function matches(
  fs: DetectorFilesystem,
  framework: FrameworkDetectionItem
) {
  const { detectors } = framework;

  if (!detectors) {
    return false;
  }

  const result = await Promise.all(
    detectors.map(async keyValue => {
      if (keyValue.hasDependency) {
        return fs.hasDependency(keyValue.hasDependency);
      }

      if (keyValue.hasFile) {
        return fs.exists(keyValue.hasFile);
      }

      return true;
    })
  );

  return result.every(res => res === true);
}

export async function detectFramework({
  fs,
  frameworkList,
}: DetectFrameworkOptions): Promise<string | null> {
  for (const framework of frameworkList) {
    if (await matches(fs, framework)) {
      return framework.slug;
    }
  }

  return null;
}
