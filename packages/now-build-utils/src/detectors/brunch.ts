import { DetectorParameters, DetectorResult } from '../types';

export default async function detectBrunch({
  fs: { exists, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('brunch');
  if (!version) return false;

  const hasConfig = await exists('brunch-config.js');
  if (!hasConfig) return false;

  return {
    buildCommand:
      (await getPackageJsonBuildCommand()) || 'brunch build --production',
    outputDirectory: 'public',
    devCommand: 'brunch watch --server --port $PORT',
    framework: {
      slug: 'brunch',
      version,
    },
  };
}
