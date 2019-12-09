import { DetectorParameters, DetectorResult } from '../types';

export default async function detectAngular({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasAngular = await hasDependency('@angular/cli');
  if (!hasAngular) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'ng build',
    buildDirectory: 'dist',
    devCommand: 'ng serve --port $PORT',
    minNodeRange: '10.x',
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
