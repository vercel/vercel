import { DetectorParameters, DetectorResult } from '../types';

export default async function detectAngular({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasAngular = await hasDependency('@angular/cli');
  if (!hasAngular) return false;
  return {
    buildDirectory: 'dist',
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
