import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSvelte({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSvelte = await hasDependency('sirv-cli');
  if (!hasSvelte) return false;
  return {
    buildCommand: 'rollup -c',
    buildDirectory: 'public',
    devCommand: 'sirv public --single --dev --port $PORT',
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
