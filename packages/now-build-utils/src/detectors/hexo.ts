import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHexo({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasHexo = await hasDependency('hexo');
  if (!hasHexo) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'hexo generate',
    outputDirectory: 'public',
    devCommand: 'hexo server --port $PORT',
    framework: {
      slug: 'hexo',
      version: await getDependencyVersion('hexo'),
    },
  };
}
