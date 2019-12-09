import { DetectorParameters, DetectorResult } from '../types';

export default async function detectStencil({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasStencil = await hasDependency('@stencil/core');
  if (!hasStencil) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'stencil build',
    buildDirectory: 'www',
    devCommand: 'stencil build --dev --watch --serve --port $PORT',
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
