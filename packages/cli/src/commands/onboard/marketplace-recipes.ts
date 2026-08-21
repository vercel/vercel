import type { MigrationSignal } from './migration-signals';

/**
 * Task-relevant Marketplace recipes, v1: the deterministic slice of "which
 * integration covers this project's detected needs".
 *
 * Inputs are facts the CLI already owns — migration signals from static
 * analysis and the live Marketplace catalog fetched at session start. The
 * output is a bounded set of providers per detected capability with a safe,
 * exact command template bound to the pinned team. Unresolved product
 * decisions (resource name, paid plans) are named, never guessed.
 *
 * Deliberately not included yet: per-provider plans, required metadata,
 * browser-checkout requirements, and injected env names — those need a
 * bounded Marketplace API answer first. Until then the recipe carries only
 * what is certain, and `vercel integration guide <slug>` remains the source
 * for the rest.
 */

export type Capability = 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'blob';

export interface CapabilityNeed {
  capability: Capability;
  /** The detected facts that created the need, for the prompt to cite. */
  because: string[];
}

export interface MarketplaceRecipeEntry {
  slug: string;
  name: string;
  description?: string;
  suggestedCommand: string;
}

export interface MarketplaceRecipe {
  capability: Capability;
  because: string[];
  entries: MarketplaceRecipeEntry[];
}

/** Providers listed per capability; a menu, not a directory. */
const MAX_ENTRIES_PER_CAPABILITY = 4;

/**
 * Catalog keyword filter per capability — matched against slug, name, and
 * description. Deliberately no bare provider-company names: a company
 * shipping several products (Upstash Redis next to Upstash Kafka) would
 * match them all, and a wrong recipe is worse than a missing one. An entry
 * qualifies through what it says it is.
 */
const CAPABILITY_KEYWORDS: Record<Capability, RegExp> = {
  postgres: /postgres/i,
  mysql: /mysql|mariadb/i,
  mongodb: /mongo/i,
  redis: /redis|valkey|\bkv\b/i,
  blob: /blob|object.?storage|\bs3\b/i,
};

/**
 * Which stateful capabilities this project needs, inferred from migration
 * signals only — every need cites the signal that created it. The evidence
 * strings matched here are this CLI's own generated text, so the matching
 * cannot drift against foreign data.
 */
export function inferCapabilities(
  signals: MigrationSignal[]
): CapabilityNeed[] {
  const needs = new Map<Capability, Set<string>>();
  const add = (capability: Capability, because: string) => {
    const set = needs.get(capability) ?? new Set();
    set.add(because);
    needs.set(capability, set);
  };

  for (const signal of signals) {
    const cite = `${signal.evidence} (${signal.source})`;
    switch (signal.kind) {
      case 'sqlite-runtime':
        // SQLite writes to a local file; deployed, that state needs a
        // managed relational store.
        add('postgres', cite);
        break;
      case 'database-volume': {
        const evidence = signal.evidence;
        if (/postgres|postgis/i.test(evidence)) add('postgres', cite);
        else if (/mysql|maria/i.test(evidence)) add('mysql', cite);
        else if (/mongo/i.test(evidence)) add('mongodb', cite);
        else if (/redis|valkey/i.test(evidence)) add('redis', cite);
        break;
      }
      case 'memory-session-store':
        add('redis', cite);
        break;
      case 'resident-worker':
        if (/bullmq|\bbull\b|bee-queue|celery/i.test(signal.evidence)) {
          add('redis', cite);
        }
        break;
      case 'shared-volume':
        add('blob', cite);
        break;
      default:
        break;
    }
  }

  return [...needs].map(([capability, because]) => ({
    capability,
    because: [...because].sort(),
  }));
}

/**
 * Match detected needs against the live catalog. Only detected capabilities
 * produce recipes, each bounded, each with a command template that carries
 * the pinned team and names its unresolved field instead of inventing one.
 * A need nothing in the catalog matches produces an empty recipe — saying
 * "nothing matched" beats silently dropping the need.
 */
export function buildRecipes(options: {
  needs: CapabilityNeed[];
  catalog: Array<{ slug: string; name: string; description?: string }>;
  /** Team slug for `--scope`; omitted from the command when unknown. */
  team?: string;
}): MarketplaceRecipe[] {
  const { needs, catalog, team } = options;
  const scope = team ? ` --scope ${team}` : '';

  return needs.map(need => ({
    capability: need.capability,
    because: need.because,
    entries: catalog
      .filter(entry =>
        CAPABILITY_KEYWORDS[need.capability].test(
          `${entry.slug} ${entry.name} ${entry.description ?? ''}`
        )
      )
      .slice(0, MAX_ENTRIES_PER_CAPABILITY)
      .map(entry => ({
        slug: entry.slug,
        name: entry.name,
        ...(entry.description ? { description: entry.description } : {}),
        suggestedCommand: `vercel integration add ${entry.slug} --name <resource-name>${scope}`,
      })),
  }));
}

/**
 * The preflight block: detected needs, matching providers, exact commands.
 * `undefined` when nothing was detected — no needs means no recipes, and
 * the full catalog (rendered elsewhere) remains the fallback.
 */
export function formatRecipes(
  recipes: MarketplaceRecipe[]
): string | undefined {
  if (recipes.length === 0) return undefined;

  const lines = [
    '- Detected stateful needs, matched by the CLI against the live Marketplace',
    '  catalog. Use one of these commands verbatim (after the plan is approved);',
    '  the only unresolved field is `<resource-name>`. Never choose a paid plan',
    '  silently — the approval gate shows cost to the user. If none of these',
    '  fit, fall back to the full catalog below:',
  ];
  for (const recipe of recipes) {
    lines.push(`  - Need: ${recipe.capability} — because:`);
    for (const because of recipe.because) {
      lines.push(`      ${because}`);
    }
    if (recipe.entries.length === 0) {
      // The need is real even when the catalog match came up empty —
      // dropping it silently would hide a required resource from the plan.
      lines.push(
        `    - No pre-matched integration — browse with \`vercel integration`,
        `      discover ${recipe.capability}\` or \`vercel integration categories\`.`
      );
      continue;
    }
    for (const entry of recipe.entries) {
      const description = entry.description ? ` — ${entry.description}` : '';
      lines.push(
        `    - ${entry.slug} (${entry.name})${description}`,
        `      ${entry.suggestedCommand}`
      );
    }
  }
  return lines.join('\n');
}
