import type { LedgerEvent } from '../../util/onboard-session';
import type { ObservedDeployment } from './deployments';

/**
 * The session's result, built deterministically from the ledger — the CLI's
 * own journal of every remote effect — plus the output scraper for anything
 * an older CLI on the agent's PATH failed to journal.
 *
 * The shape is the one question every run ends on: what exists now, does it
 * work, and what does it cost. Cost is the platform's own words, verbatim:
 * the billing plan's stated cost or name in the column, its own detail
 * lines underneath. No parsing, no arithmetic, no estimate — a summed
 * number would be this CLI's interpretation of pricing prose, and a wrong
 * dollar figure misinforms exactly where the user most needs facts.
 */
export interface SessionReport {
  rows: ReportRow[];
  /** Deployment URLs, for the profile. */
  deployments: string[];
  /** `integration/resource` pairs, for the profile. */
  resourcesProvisioned: string[];
}

export interface ReportRow {
  kind: 'deployment' | 'alias' | 'resource' | 'project' | 'removed';
  resource: string;
  status: string;
  cost: string;
  /** Secondary lines under the row: a dashboard URL, plan detail lines. */
  details?: string[];
  production?: boolean;
  unverified?: boolean;
}

/** The plan fields journaled by the provisioning effect site. */
interface RecordedPlan {
  name?: string;
  cost?: string;
  paymentMethodRequired?: boolean;
  details?: Array<{ label: string; value?: string }>;
}

const NO_COST = '—';

/** Plan detail lines shown under a resource row; the rest are in the ledger. */
const MAX_PLAN_DETAILS = 4;

export function buildSessionReport(
  ledger: LedgerEvent[],
  observed: ObservedDeployment[]
): SessionReport {
  const rows: ReportRow[] = [];

  // --- Projects ---------------------------------------------------------
  for (const event of ledger) {
    if (event.type !== 'project-created' && event.type !== 'project-linked') {
      continue;
    }
    const org = typeof event.org === 'string' ? `${event.org}/` : '';
    rows.push({
      kind: 'project',
      resource: `project ${org}${String(event.project)}`,
      status: event.type === 'project-created' ? 'created' : 'linked',
      cost: NO_COST,
    });
  }

  // --- Deployments --------------------------------------------------------
  interface Outcome {
    url: string;
    production: boolean;
    verified: boolean;
    inspectUrl?: string;
  }

  const outcomes = new Map<string, Outcome>();
  for (const event of ledger) {
    if (event.type === 'deployment' && typeof event.url === 'string') {
      outcomes.set(event.url, {
        url: event.url,
        production: event.target === 'production',
        verified: true,
      });
    }
  }

  // The latest verification per deployment, journaled by `onboard verify` —
  // the CLI's own measurement, so "checks passed" is never the model's
  // claim.
  const verifications = new Map<string, { passed: number; failed: number }>();
  for (const event of ledger) {
    if (
      event.type === 'verification' &&
      typeof event.deployment === 'string' &&
      typeof event.passed === 'number' &&
      typeof event.failed === 'number'
    ) {
      verifications.set(event.deployment, {
        passed: event.passed,
        failed: event.failed,
      });
    }
  }

  const ledgerAware = ledger.length > 0;
  const aliases: Array<{ url: string; of: string }> = [];
  for (const seen of observed) {
    const existing = outcomes.get(seen.url);
    if (existing) {
      existing.inspectUrl ??= seen.inspectUrl;
      continue;
    }
    // A scraped URL sharing a dashboard URL with a journaled deployment is
    // the same deployment wearing another name (a domain alias), not a
    // second deployment — reporting it as one overstates what the session
    // did.
    const aliasOf =
      seen.inspectUrl === undefined
        ? undefined
        : [...outcomes.values()].find(
            outcome =>
              outcome.verified && outcome.inspectUrl === seen.inspectUrl
          );
    if (aliasOf) {
      aliases.push({ url: seen.url, of: aliasOf.url });
      continue;
    }
    outcomes.set(seen.url, {
      url: seen.url,
      production: seen.production,
      inspectUrl: seen.inspectUrl,
      verified: !ledgerAware,
    });
  }

  for (const outcome of outcomes.values()) {
    const checks = verifications.get(outcome.url);
    const checkNote = checks
      ? checks.failed > 0
        ? ` · ${checks.failed}/${checks.passed + checks.failed} checks failing`
        : ` · ${checks.passed}/${checks.passed + checks.failed} checks passed`
      : '';
    rows.push({
      kind: 'deployment',
      resource: outcome.url,
      status: outcome.verified
        ? (outcome.production ? 'deployed, production' : 'deployed') + checkNote
        : 'reported, unverified',
      cost: 'usage',
      ...(outcome.inspectUrl ? { details: [outcome.inspectUrl] } : {}),
      production: outcome.production,
      unverified: !outcome.verified,
    });
    for (const alias of aliases.filter(entry => entry.of === outcome.url)) {
      rows.push({
        kind: 'alias',
        resource: alias.url,
        status: 'alias of the above',
        cost: NO_COST,
      });
    }
  }

  // --- Resources ----------------------------------------------------------
  for (const event of ledger) {
    if (event.type !== 'resource-provisioned') continue;
    const plan = (event.plan ?? undefined) as RecordedPlan | undefined;
    rows.push({
      kind: 'resource',
      resource: `${String(event.resource)} (${String(event.integration)})`,
      status: 'provisioned',
      cost: describePlan(plan),
      ...(plan?.details && plan.details.length > 0
        ? {
            details: plan.details
              .slice(0, MAX_PLAN_DETAILS)
              .map(detail =>
                detail.value !== undefined
                  ? `${detail.label}: ${detail.value}`
                  : detail.label
              ),
          }
        : {}),
    });
  }

  for (const event of ledger) {
    if (event.type !== 'project-removed' && event.type !== 'resource-removed') {
      continue;
    }
    rows.push({
      kind: 'removed',
      resource:
        event.type === 'project-removed'
          ? `project ${String(event.project)}`
          : `resource ${String(event.resource)}`,
      status: 'removed',
      cost: NO_COST,
    });
  }

  return {
    rows,
    deployments: rows
      .filter(row => row.kind === 'deployment')
      .map(row => row.resource),
    resourcesProvisioned: ledger
      .filter(event => event.type === 'resource-provisioned')
      .map(event => `${event.integration}/${event.resource}`),
  };
}

/**
 * The cost column: the billing plan's own words. The platform's stated
 * `cost` when present (verbatim, with the plan named), otherwise the plan
 * name alone — the detail lines under the row carry whatever pricing the
 * integration chose to state, in its own format.
 */
function describePlan(plan: RecordedPlan | undefined): string {
  if (!plan) {
    return 'unknown plan';
  }
  if (plan.cost) {
    return plan.name ? `${plan.cost} (${plan.name})` : plan.cost;
  }
  return plan.name ? `${plan.name} plan` : 'unknown plan';
}
