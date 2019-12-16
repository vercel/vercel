import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHexo({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('hexo');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'hexo generate',
    outputDirectory: 'public',
    devCommand: 'hexo server --port $PORT',
    framework: {
      slug: 'hexo',
      version,
    },
  };
}
