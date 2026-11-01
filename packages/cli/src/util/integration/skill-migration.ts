import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Public, Vercel-maintained mirror that replaces Neon's upstream skill source.
 * Pinned, reviewed content Vercel controls (see the repo's NOTICE for
 * attribution). Installing from here overwrites a same-named skill already in
 * the project and re-points its recorded source to this mirror.
 */
export const MARKETPLACE_SKILLS_MIRROR =
  'https://github.com/vercel/marketplace-skills';

/** The Neon marketplace skill that migrates to the Vercel-maintained mirror. */
export const NEON_MIGRATE_SKILL = 'neon-postgres';
/** The deprecated Neon "platform overview" skill, removed (not in the mirror). */
export const NEON_REMOVE_SKILL = 'neon';

interface SkillLockEntry {
  source?: string;
  sourceUrl?: string;
}

interface SkillsLock {
  version?: number;
  skills?: Record<string, SkillLockEntry>;
}

export interface NeonSkillMigrationPlan {
  /** Present and still sourced from Neon → re-install from the Vercel mirror. */
  migrate: string[];
  /** The deprecated `neon` skill, present and sourced from Neon → remove. */
  remove: string[];
}

/**
 * True when a lock entry was installed from a Neon-controlled source. Also
 * excludes skills already pointing at the Vercel mirror, so the plan is
 * idempotent (a migrated `neon-postgres` is no longer flagged).
 */
function isNeonSource(entry: SkillLockEntry | undefined): boolean {
  if (!entry) return false;
  const src = `${entry.source ?? ''} ${entry.sourceUrl ?? ''}`.toLowerCase();
  return src.includes('neondatabase/agent-skills') || src.includes('neon.com');
}

/** Read and parse `skills-lock.json` from a directory; null when absent/invalid. */
export function readSkillsLock(cwd: string): SkillsLock | null {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'skills-lock.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.skills) {
      return parsed as SkillsLock;
    }
  } catch {
    // Malformed lockfile → treat as nothing to migrate.
  }
  return null;
}

/**
 * Determine which Neon marketplace skills in a lockfile should migrate to the
 * Vercel mirror and which should be removed. Only skills still sourced from
 * Neon are considered, so the result is safe to apply repeatedly.
 */
export function planNeonSkillMigration(
  lock: SkillsLock | null
): NeonSkillMigrationPlan {
  const skills = lock?.skills ?? {};
  const migrate = isNeonSource(skills[NEON_MIGRATE_SKILL])
    ? [NEON_MIGRATE_SKILL]
    : [];
  const remove = isNeonSource(skills[NEON_REMOVE_SKILL])
    ? [NEON_REMOVE_SKILL]
    : [];
  return { migrate, remove };
}

export function isEmptyPlan(plan: NeonSkillMigrationPlan): boolean {
  return plan.migrate.length === 0 && plan.remove.length === 0;
}

/** `npx` argv to re-install a skill from the mirror (overwrites + re-points). */
export function buildMigrateArgs(skill: string): string[] {
  return [
    '--yes',
    'skills',
    'add',
    MARKETPLACE_SKILLS_MIRROR,
    '--skill',
    skill,
    '--yes',
  ];
}

/** `npx` argv to remove a skill from the current project. */
export function buildRemoveArgs(skill: string): string[] {
  return ['--yes', 'skills', 'remove', skill, '--yes'];
}

/** Human-readable migrate command, for disclosure and non-interactive output. */
export function migrateCommand(skill: string): string {
  return `npx skills add ${MARKETPLACE_SKILLS_MIRROR} --skill ${skill}`;
}

/** Human-readable remove command, for disclosure and non-interactive output. */
export function removeCommand(skill: string): string {
  return `npx skills remove ${skill}`;
}
