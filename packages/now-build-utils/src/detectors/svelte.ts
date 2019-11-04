import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSvelte({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSvelte = await hasDependency('sirv-cli');
  if (!hasSvelte) return false;
  return {
    buildDirectory: 'public',
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
