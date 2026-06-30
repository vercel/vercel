import type { DetectorFilesystem } from './filesystem';
import type { FrameworkDetectionItem } from '@vercel/frameworks';

/**
 * Successful match payload.
 */
export interface DetectorMatch {
  /**
   * The version captured by a `matchPackage` detector.
   */
  detectedVersion?: string;
}

/**
 * Evaluate a single detector against the project filesystem.
 *
 * Returns `null` when the detector did not match, or a `DetectorMatch` object
 * (possibly empty) when it did. The `detectedVersion` field is populated only
 * for `matchPackage` detectors that captured a literal version.
 */
export async function checkDetector(
  fs: DetectorFilesystem,
  item: FrameworkDetectionItem
): Promise<DetectorMatch | null> {
  let { path, matchContent } = item;
  const { matchPackage } = item;

  if (matchPackage && matchContent) {
    throw new Error(
      'Cannot specify "matchPackage" and "matchContent" in the same detector'
    );
  }
  if (matchPackage && path) {
    throw new Error(
      'Cannot specify "matchPackage" and "path" in the same detector ("path" is implicitly "package.json")'
    );
  }
  if (!path && !matchPackage) {
    throw new Error('Detector must specify either "path" or "matchPackage"');
  }

  if (!path) path = 'package.json';
  if (matchPackage) {
    matchContent = `"(dev)?(d|D)ependencies":\\s*\\{[^}]*"${matchPackage}":\\s*"(.+?)"[^}]*\\}`;
  }

  if (!(await fs.hasPath(path))) return null;

  if (matchContent) {
    if (!(await fs.isFile(path))) return null;
    const content = (await fs.readFile(path)).toString();
    const match = new RegExp(matchContent, 'm').exec(content);
    if (!match) return null;
    if (matchPackage && match[3]) {
      return { detectedVersion: match[3] };
    }
  }

  return {};
}
