import { DetectorParameters, DetectorResult } from '../types';

export default async function detectStencil({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('@stencil/core');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'stencil build',
    outputDirectory: 'www',
    devCommand: 'stencil build --dev --watch --serve --port $PORT',
    framework: {
      slug: '@stencil/core',
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
