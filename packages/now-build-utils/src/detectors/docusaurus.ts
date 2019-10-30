import { DetectorParameters, DetectorResult } from '../types';

export default async function detectDocusaurus({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasDocusaurus = await hasDependency('@docusaurus/core');
  if (!hasDocusaurus) return false;
  return {
    buildDirectory: 'build',
  };
}
