import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPreact({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('preact-cli');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'preact build',
    outputDirectory: 'build',
    devCommand: 'preact watch --port $PORT',
    framework: {
      slug: 'preact-cli',
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
