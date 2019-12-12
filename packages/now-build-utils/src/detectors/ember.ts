import { DetectorParameters, DetectorResult } from '../types';

export default async function detectEmber({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('ember-cli');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'ember build',
    outputDirectory: 'dist',
    devCommand: 'ember serve --port $PORT',
    framework: {
      slug: 'ember-cli',
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
