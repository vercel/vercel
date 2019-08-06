import semver from 'semver';

export function getDistTag(version: string): string {
  const parsed = semver.parse(version);
  if (parsed && typeof parsed.prerelease[0] === 'string') {
    return parsed.prerelease[0] as string;
  }
  return 'latest';
}

