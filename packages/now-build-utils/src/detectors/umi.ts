import { DetectorParameters, DetectorResult } from '../types';

export default async function detectUmiJS({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasUmi = await hasDependency('umi');
  if (!hasUmi) return false;
  return {
    buildCommand: ['umi', 'build'],
    buildDirectory: 'dist',
    devCommand: ['umi', 'dev', '--port', '$PORT'],
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
