import { Monorepo } from '@vercel/monorepos';
import { DetectorFilesystem } from './detectors/filesystem';
import { matches } from './matches';

export interface DetectFrameworkOptions {
  fs: DetectorFilesystem;
  monorepoList: readonly Monorepo[];
}

export async function detectMonorepo({
  fs,
  monorepoList,
}: DetectFrameworkOptions): Promise<string | null> {
  for (const monorepo of monorepoList) {
    if (await matches(fs, monorepo)) {
      return monorepo.slug;
    }
  }

  return null;
}
