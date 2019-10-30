import { DetectorParameters, DetectorResult } from '../types';

export default async function detectPreact({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasPreact = await hasDependency('preact-cli');
  if (!hasPreact) return false;
  return {
    buildDirectory: 'build',
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
