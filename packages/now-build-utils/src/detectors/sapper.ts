import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSapper({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('sapper');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'sapper export',
    outputDirectory: '__sapper__/export',
    devCommand: 'sapper dev --port $PORT',
    framework: {
      slug: 'sapper',
      version,
    },
  };
}
