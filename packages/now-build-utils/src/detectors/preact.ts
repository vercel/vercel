import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPreact({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasPreact = await hasDependency('preact-cli');
  if (!hasPreact) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'preact build',
    outputDirectory: 'build',
    devCommand: 'preact watch --port $PORT',
    framework: {
      slug: 'preact-cli',
      version: await getDependencyVersion('preact-cli')
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
