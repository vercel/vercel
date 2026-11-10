import { describe, expect, it } from 'vitest';
import {
  resolveProductSkills,
  resolveSkillFromUrl,
} from '../../../../src/util/integration/skill-suggestion';

describe('resolveSkillFromUrl', () => {
  it('parses a GitHub SKILL.md URL (lowercases owner/repo, keeps skill dir)', () => {
    expect(
      resolveSkillFromUrl(
        'https://github.com/Shopify/Shopify-AI-Toolkit/blob/main/skills/shopify-dev/SKILL.md'
      )
    ).toEqual({
      repoUrl: 'https://github.com/shopify/shopify-ai-toolkit',
      skill: 'shopify-dev',
      command:
        'npx skills add https://github.com/shopify/shopify-ai-toolkit --skill shopify-dev',
    });
  });

  it('handles /tree/ links pointing at the skill folder (no SKILL.md)', () => {
    const resolved = resolveSkillFromUrl(
      'https://github.com/neondatabase/agent-skills/tree/main/neon-postgres'
    );
    expect(resolved?.command).toBe(
      'npx skills add https://github.com/neondatabase/agent-skills --skill neon-postgres'
    );
    expect(resolved?.skill).toBe('neon-postgres');
  });

  it('omits --skill when SKILL.md sits at the repo root', () => {
    const resolved = resolveSkillFromUrl(
      'https://github.com/acme/skill-repo/blob/main/SKILL.md'
    );
    expect(resolved?.command).toBe(
      'npx skills add https://github.com/acme/skill-repo'
    );
    expect(resolved?.skill).toBeUndefined();
  });

  it('omits --skill for a bare repo URL', () => {
    const resolved = resolveSkillFromUrl('https://github.com/acme/skill-repo');
    expect(resolved?.command).toBe(
      'npx skills add https://github.com/acme/skill-repo'
    );
  });

  it('returns null for non-GitHub URLs', () => {
    expect(
      resolveSkillFromUrl('https://skills.sh/acme/skill-repo/my-skill')
    ).toBeNull();
    expect(resolveSkillFromUrl('https://example.com/SKILL.md')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(resolveSkillFromUrl('not a url')).toBeNull();
    expect(resolveSkillFromUrl('')).toBeNull();
  });

  it('returns null when owner or repo is missing', () => {
    expect(resolveSkillFromUrl('https://github.com/acme')).toBeNull();
  });
});

describe('resolveProductSkills', () => {
  it('resolves every valid GitHub entry and skips the rest', () => {
    const resolved = resolveProductSkills({
      agentSkills: [
        'https://github.com/Shopify/Shopify-AI-Toolkit/blob/main/skills/shopify-dev/SKILL.md',
        'https://skills.sh/acme/repo/skill', // non-GitHub → skipped
        'not a url', // unparseable → skipped
        'https://github.com/acme/widgets/blob/main/skills/widget/SKILL.md',
      ],
    });

    expect(resolved.map(s => s.command)).toEqual([
      'npx skills add https://github.com/shopify/shopify-ai-toolkit --skill shopify-dev',
      'npx skills add https://github.com/acme/widgets --skill widget',
    ]);
  });

  it('returns an empty array when nothing is declared', () => {
    expect(resolveProductSkills({})).toEqual([]);
    expect(resolveProductSkills({ agentSkills: [] })).toEqual([]);
  });
});
