import { describe, expect, it } from 'vitest';
import {
  buildMigrateArgs,
  buildRemoveArgs,
  isEmptyPlan,
  MARKETPLACE_SKILLS_MIRROR,
  migrateCommand,
  planNeonSkillMigration,
  removeCommand,
} from '../../../../src/util/integration/skill-migration';

describe('planNeonSkillMigration', () => {
  it('migrates neon-postgres and removes neon when both are Neon-sourced', () => {
    const plan = planNeonSkillMigration({
      version: 1,
      skills: {
        neon: {
          sourceUrl: 'https://github.com/neondatabase/agent-skills',
        },
        'neon-postgres': {
          sourceUrl:
            'https://github.com/neondatabase/agent-skills/tree/main/skills/neon-postgres',
        },
      },
    });
    expect(plan).toEqual({ migrate: ['neon-postgres'], remove: ['neon'] });
  });

  it('matches skills served from neon.com', () => {
    const plan = planNeonSkillMigration({
      skills: {
        'neon-postgres': {
          source: 'https://neon.com/docs/ai/skills/neon-postgres/SKILL.md',
        },
      },
    });
    expect(plan.migrate).toEqual(['neon-postgres']);
    expect(plan.remove).toEqual([]);
  });

  it('is idempotent: skips neon-postgres already pointing at the Vercel mirror', () => {
    const plan = planNeonSkillMigration({
      skills: {
        'neon-postgres': { sourceUrl: MARKETPLACE_SKILLS_MIRROR },
      },
    });
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('ignores same-named skills from an unrelated source', () => {
    const plan = planNeonSkillMigration({
      skills: {
        'neon-postgres': {
          sourceUrl: 'https://github.com/someone-else/my-skills',
        },
      },
    });
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('handles a null/empty lock', () => {
    expect(isEmptyPlan(planNeonSkillMigration(null))).toBe(true);
    expect(isEmptyPlan(planNeonSkillMigration({ skills: {} }))).toBe(true);
  });
});

describe('command builders', () => {
  it('migrate args install from the mirror and overwrite non-interactively', () => {
    expect(buildMigrateArgs('neon-postgres')).toEqual([
      '--yes',
      'skills',
      'add',
      MARKETPLACE_SKILLS_MIRROR,
      '--skill',
      'neon-postgres',
      '--yes',
    ]);
  });

  it('remove args remove the named skill non-interactively', () => {
    expect(buildRemoveArgs('neon')).toEqual([
      '--yes',
      'skills',
      'remove',
      'neon',
      '--yes',
    ]);
  });

  it('human-readable commands omit the npx bootstrap flags', () => {
    expect(migrateCommand('neon-postgres')).toBe(
      `npx skills add ${MARKETPLACE_SKILLS_MIRROR} --skill neon-postgres`
    );
    expect(removeCommand('neon')).toBe('npx skills remove neon');
  });
});
