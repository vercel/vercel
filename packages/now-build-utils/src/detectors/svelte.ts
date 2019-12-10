import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSvelte({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSvelte = await hasDependency('sirv-cli');
  if (!hasSvelte) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'rollup -c',
    outputDirectory: 'public',
    devCommand: 'sirv public --single --dev --port $PORT',
    framework: {
      slug: 'sirv-cli',
      version: await getDependencyVersion('sirv-cli'),
    },
    routes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  };
}
