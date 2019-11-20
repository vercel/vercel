import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGatsby({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGatsby = await hasDependency('gatsby');
  if (!hasGatsby) {
    return false;
  }
  return {
    buildCommand: ['gatsby', 'build'],
    buildDirectory: 'public',
    devCommand: ['gatsby', 'develop', '-p', '$PORT'],
    cachePattern: '.cache/**',
  };
}
