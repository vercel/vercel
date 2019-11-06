import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPolymer({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasPolymer = await hasDependency('polymer-cli');
  if (!hasPolymer) return false;
  return {
    buildCommand: ['polymer', 'build'],
    buildDirectory: 'build',
    devCommand: ['polymer', 'serve', '--port', '$PORT'],
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
