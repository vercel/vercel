import { DetectorParameters, DetectorResult } from '../types';

export default async function detectEmber({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasEmber = await hasDependency('ember-cli');
  if (!hasEmber) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'ember build',
    outputDirectory: 'dist',
    devCommand: 'ember serve --port $PORT',
    framework: {
      slug: 'ember-cli',
      version: await getDependencyVersion('ember-cli')
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
