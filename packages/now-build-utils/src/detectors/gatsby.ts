import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGatsby({
  fs: { exists, hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGatsby = await hasDependency('gatsby');
  if (!hasGatsby) {
    return false;
  }
  const hasConfig = await exists('gatsby-config.js');
  if (!hasConfig) {
    return false;
  }
  return {
    buildCommand: ['gatsby', 'build'],
    buildDirectory: 'public',
    devCommand: ['gatsby', 'develop', '-p', '$PORT'],
  };
}
