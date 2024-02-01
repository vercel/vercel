import type { RepoInfo } from './connect-git-provider';

export function repoInfoToUrl(info: RepoInfo): string {
  return `https://${info.provider}.com/${info.org}/${info.repo}`;
}
