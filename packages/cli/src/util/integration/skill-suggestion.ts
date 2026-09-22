import type { IntegrationProduct } from './types';

export interface ResolvedSkill {
  /** GitHub repo URL passed to `npx skills add`. */
  repoUrl: string;
  /** Skill directory (the folder holding SKILL.md), when the link points at one. */
  skill?: string;
  /** Ready-to-run install command. */
  command: string;
}

/**
 * Resolve `npx skills add` suggestions from a product's declared `agentSkills`.
 * Non-GitHub or unparseable entries are skipped.
 */
export function resolveProductSkills(
  product: Pick<IntegrationProduct, 'agentSkills'>
): ResolvedSkill[] {
  const resolved: ResolvedSkill[] = [];
  for (const entry of product.agentSkills ?? []) {
    const skill = resolveSkillFromUrl(entry);
    if (skill) {
      resolved.push(skill);
    }
  }
  return resolved;
}

/**
 * Turn a GitHub skill link into an `npx skills add` command, e.g.
 * `.../Shopify-AI-Toolkit/blob/main/skills/shopify-dev/SKILL.md` →
 * `npx skills add https://github.com/shopify/shopify-ai-toolkit --skill shopify-dev`.
 *
 * Owner/repo are lowercased to match skills.sh's canonical form; the skill
 * directory is kept as-is. Returns null for non-GitHub or unparseable URLs.
 */
export function resolveSkillFromUrl(value: string): ResolvedSkill | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.hostname.replace(/^www\./, '') !== 'github.com') {
    return null;
  }

  // <owner>/<repo>/(blob|tree)/<branch>/<path...>/<skill>/SKILL.md
  const [owner, repo, kind, , ...rest] = url.pathname
    .split('/')
    .filter(Boolean);
  if (!owner || !repo) {
    return null;
  }

  const repoUrl = `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`;

  let skill: string | undefined;
  if (kind === 'blob' || kind === 'tree') {
    const parts = rest.filter(part => part.toLowerCase() !== 'skill.md');
    skill = parts[parts.length - 1];
  }

  const command = skill
    ? `npx skills add ${repoUrl} --skill ${skill}`
    : `npx skills add ${repoUrl}`;

  return { repoUrl, skill, command };
}
