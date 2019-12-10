import { DetectorParameters, DetectorResult } from '../types';

export default async function detectStencil({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasStencil = await hasDependency('@stencil/core');
  if (!hasStencil) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'stencil build',
    outputDirectory: 'www',
    devCommand: 'stencil build --dev --watch --serve --port $PORT',
    framework: {
      slug: '@stencil/core',
      version: await getDependencyVersion('@stencil/core'),
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
