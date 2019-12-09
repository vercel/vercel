import { DetectorParameters, DetectorResult } from '../types';

export default async function detectDocusaurus({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasDocusaurus = await hasDependency('docusaurus');
  if (!hasDocusaurus) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'docusaurus-build',
    buildDirectory: 'build',
    devCommand: 'docusaurus-start --port $PORT',
  };
}
