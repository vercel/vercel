import { DetectorParameters, DetectorResult } from '../types';

export default async function detectEleventy({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasEleventy = await hasDependency('@11ty/eleventy');
  if (!hasEleventy) return false;
  return {
    buildDirectory: '_site',
  };
}
