import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPolymer({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('polymer-cli');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'polymer build',
    outputDirectory: 'build',
    devCommand: 'polymer serve --port $PORT',
    framework: {
      slug: 'polymer-cli',
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
