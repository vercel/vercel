import { DetectorParameters, DetectorResult } from '../types';

export default async function detectUmiJS({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasUmi = await hasDependency('umi');
  if (!hasUmi) return false;
  return {
    buildDirectory: 'dist',
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
