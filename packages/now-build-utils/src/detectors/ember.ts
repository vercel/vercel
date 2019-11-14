import { DetectorParameters, DetectorResult } from '../types';

export default async function detectEmber({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasEmber = await hasDependency('ember-cli');
  if (!hasEmber) return false;
  return {
    buildCommand: ['ember', 'build'],
    buildDirectory: 'dist',
    devCommand: ['ember', 'serve', '--port', '$PORT'],
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
