import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPolymer({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasPolymer = await hasDependency('polymer-cli');
  if (!hasPolymer) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'polymer build',
    outputDirectory: 'build',
    devCommand: 'polymer serve --port $PORT',
    framework: {
      slug: 'polymer-cli',
      version: await getDependencyVersion('polymer-cli')
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
