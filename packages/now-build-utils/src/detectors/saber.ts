import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSaber({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSaber = await hasDependency('saber');
  if (!hasSaber) return false;
  return {
    buildCommand: 'saber build',
    buildDirectory: 'public',
    devCommand: 'saber --port $PORT',
    routes: [
      {
        src: '/_saber/.*',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
      },
      {
        handle: 'filesystem',
      },
      {
        src: '.*',
        status: 404,
        dest: '404.html',
      },
    ],
  };
}
