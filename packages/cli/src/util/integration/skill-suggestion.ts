import type { IntegrationProduct } from './types';

export interface ResolvedSkill {
  /** What a consumer (e.g. an AI agent) should do with this entry. */
  action: 'install';
  /** The GitHub repo URL passed to `npx skills add`. */
  repoUrl: string;
  /** The skill name (the folder that holds SKILL.md), when the link points at one. */
  skill?: string;
  /** Ready-to-run install command. */
  command: string;
  /** The original `agentSkills` entry this was derived from. */
  source: string;
}

/**
 * Resolve `npx skills add` suggestions for a freshly-provisioned product from
 * its declared `agentSkills`. Each entry is expected to be a public GitHub
 * `SKILL.md` (or skill-folder) link — the publisher is the source of truth.
 * Non-GitHub or unparseable entries are skipped. Returns [] when nothing
 * usable is declared.
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
 * Turn a GitHub skill link into an `npx skills add` command.
 *
 * Example:
 *   https://github.com/Shopify/Shopify-AI-Toolkit/blob/main/skills/shopify-dev/SKILL.md
 *   → npx skills add https://github.com/shopify/shopify-ai-toolkit --skill shopify-dev
 *
 * Owner/repo are lowercased — GitHub resolves them case-insensitively and that
 * matches skills.sh's canonical form. The skill name (the directory containing
 * SKILL.md) is preserved as-is, since it must match the real folder. Returns
 * null for non-GitHub or unparseable URLs.
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

  // segments: <owner>/<repo>/(blob|tree)/<branch>/<...path>/<skill>/SKILL.md
  const segments = url.pathname.split('/').filter(Boolean);
  const [owner, repo, kind, , ...rest] = segments;
  if (!owner || !repo) {
    return null;
  }

  const repoUrl = `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`;

  let skill: string | undefined;
  if (kind === 'blob' || kind === 'tree') {
    // The skill is the directory that holds SKILL.md.
    const parts = rest.filter(part => part.toLowerCase() !== 'skill.md');
    skill = parts[parts.length - 1];
  }

  const command = skill
    ? `npx skills add ${repoUrl} --skill ${skill}`
    : `npx skills add ${repoUrl}`;

  return { action: 'install', repoUrl, skill, command, source: value };
}
