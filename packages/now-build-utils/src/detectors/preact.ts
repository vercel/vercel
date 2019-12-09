import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPreact({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasPreact = await hasDependency('preact-cli');
  if (!hasPreact) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'preact build',
    buildDirectory: 'build',
    devCommand: 'preact watch --port $PORT',
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
