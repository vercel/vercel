import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSvelte({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('sirv-cli');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'rollup -c',
    outputDirectory: 'public',
    devCommand: 'sirv public --single --dev --port $PORT',
    framework: {
      slug: 'sirv-cli',
      version,
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
