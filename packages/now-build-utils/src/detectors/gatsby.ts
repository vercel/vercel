import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGatsby({
  fs: { exists, hasDependency, readPackageJson },
}: DetectorParameters): Promise<DetectorResult> {
  const [pkg, hasGatsby, hasConfig] = await Promise.all([
    readPackageJson(),
    hasDependency('gatsby'),
    exists('gatsby-config.js'),
  ]);
  if (!pkg || !hasGatsby || !hasConfig) {
    return false;
  }
  return {
    buildCommand: ['gatsby', 'build'],
    buildDirectory: 'public',
  };
}
