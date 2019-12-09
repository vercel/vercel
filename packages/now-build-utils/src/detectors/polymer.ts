import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPolymer({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasPolymer = await hasDependency('polymer-cli');
  if (!hasPolymer) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'polymer build',
    buildDirectory: 'build',
    devCommand: 'polymer serve --port $PORT',
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
