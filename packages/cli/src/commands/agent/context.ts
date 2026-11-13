import type { UserContext } from './types';
import { execFileSync } from 'node:child_process';

export function currentGitBranch(cwd: string): string | undefined {
  try {
    return (
      execFileSync('git', ['branch', '--show-current'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {}
}

export interface AgentContext {
  team: { id: string; slug: string };
  project?: { id: string; slug: string };
  branch?: string;
}

export function toUserContext(context: AgentContext): UserContext {
  const params: Record<string, string> = {};
  if (context.project) params.project = context.project.slug;
  if (context.branch) params.branch = context.branch;
  return {
    source: 'vercel-cli',
    routeLabel:
      "Terminal (Vercel CLI `vercel agent`, run from the user's local checkout)",
    scope: context.team.slug,
    pathname: context.project
      ? `/${context.team.slug}/${context.project.slug}`
      : `/${context.team.slug}`,
    params,
  };
}
