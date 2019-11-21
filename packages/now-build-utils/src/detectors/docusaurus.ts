import { DetectorParameters, DetectorResult } from '../types';

export default async function detectDocusaurus({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasDocusaurus = await hasDependency('docusaurus');
  if (!hasDocusaurus) return false;
  return {
    buildCommand: ['docusaurus-build'],
    buildDirectory: 'build',
    devCommand: ['docusaurus-start', '--port', '$PORT'],
  };
}
