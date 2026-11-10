import type Client from '../client';
import { getCommandName } from '../pkg-name';
import { quoteArg } from '../flags/quote-arg';
import { teamCache } from '../teams/get-team-by-id-or-slug';

/**
 * The command that buys the subscription the observability endpoints gate on.
 * Named in one place so the hint and the command it points at cannot drift.
 */
export const OBSERVABILITY_PLUS_PURCHASE_COMMAND =
  'buy addon observability-plus';

export const PRIORITY_PROJECT_ENABLE_COMMAND = 'project priority enable';

export const BUY_PRO_COMMAND = 'buy pro';

const PROJECT_ENABLE_COMMAND = 'project observability enable';

export type ObservabilityPlusFix = {
  command?: string;
  excludeFlags?: string[];
  hint: string;
  preserveProject?: boolean;
  when?: string;
};

/**
 * Whether the refusal a caller is about to print is the Observability Plus
 * one, and so whether buying that subscription is the next step.
 *
 * Matched on the message rather than the status, because the status does not
 * distinguish the products. Every paid product answering `/metrics/v1`
 * refuses with `402` and `code: 'payment_required'` — Observability Plus,
 * Web Analytics custom events, and whatever is sold next — so gating on `402`
 * alone tells a Hobby team to buy Observability Plus when what it read was
 * "Accessing Analytics custom events requires an Enterprise or Pro plan".
 *
 * Matched on the *resolved* message, the one the reader sees, rather than on
 * `serverMessage`: a 402 that carried no message falls back to our own
 * wording, which names Observability Plus, and the hint has to agree with the
 * line above it either way.
 *
 * `/metrics/v1` (CLI metrics and firewall traffic) refuses with
 * "Observability Plus is required for this query." and no `meta.reason`.
 * `/v2/observability/query` sets `meta.reason` to one of
 * `plan_upgrade_required`, `subscription_disabled`, `project_excluded`,
 * `subscription_required`, each with its own message. Prefer that reason
 * when the error carried it.
 *
 * Some firewall plan gates name Priority project rather than Observability
 * Plus. Match that message separately so we do not sell Plus for it.
 */
export function mentionsObservabilityPlus(message: string): boolean {
  return /observability\s+plus/i.test(message);
}

/** Whether the refusal named Priority project (or the leftover Priority Tier copy). */
export function mentionsPriorityProject(message: string): boolean {
  return (
    /priority\s+project/i.test(message) || /priority\s+tier/i.test(message)
  );
}

/** `meta.reason` from the observability query 402, when the API sent one. */
export function observabilityPlusDenialReason(
  error: unknown
): string | undefined {
  if (!error || typeof error !== 'object' || !('meta' in error)) return;
  const meta = error.meta;
  if (
    meta &&
    typeof meta === 'object' &&
    'reason' in meta &&
    typeof meta.reason === 'string'
  ) {
    return meta.reason;
  }
}

/** The recovery line printed beneath an Observability Plus refusal. */
export function observabilityPlusPurchaseHint(): string {
  return `Subscribe with ${getCommandName(OBSERVABILITY_PLUS_PURCHASE_COMMAND)}.`;
}

/** Hobby and OSS cannot buy Observability Plus or enable a Priority project. */
export function isHobbyLikePlan(plan?: string): boolean {
  return plan === 'hobby' || plan === 'oss';
}

export function isProOrEnterprisePlan(plan?: string): boolean {
  return plan === 'pro' || plan === 'enterprise';
}

/**
 * The cached team's plan, when a prior lookup already populated `teamCache`.
 * Missing billing is not treated as Hobby: the API always sends it, tests
 * often omit it, and a Plus 402 on an unknown plan must keep selling Plus.
 */
export function currentTeamPlan(client?: Client): string | undefined {
  const id = client?.config?.currentTeam;
  if (!id) return;
  return teamCache.get(id)?.billing?.plan;
}

/**
 * Plan for a team the request already named. A miss stays unknown: the
 * selected team's plan must not fill in for a different team.
 */
function planForTeam(idOrSlug: string): string | undefined {
  return teamCache.get(idOrSlug)?.billing?.plan;
}

/**
 * The recovery a command offers when the plan itself is what it lacked.
 * `buy pro` may take `--yes`; this still names a person as the approver.
 */
export function buyProFix(hint?: string): {
  command: string;
  hint: string;
  when: string;
} {
  return {
    command: BUY_PRO_COMMAND,
    hint: hint ?? `Upgrade with ${getCommandName(BUY_PRO_COMMAND)}.`,
    when: 'a person has approved upgrading the plan',
  };
}

/**
 * The recovery a command offers when Observability Plus is what it lacked:
 * one line for a person, and the same command for an agent.
 *
 * Safe to hand an agent because the purchase cannot complete unattended —
 * `buy addon observability-plus` refuses without `--yes` outside a TTY, and
 * prompts with a default of no inside one. `when` says so rather than leaving
 * an agent to infer that a billing change is waiting on a person.
 */
export function observabilityPlusPurchaseFix(): {
  command: string;
  hint: string;
  when: string;
} {
  return {
    command: OBSERVABILITY_PLUS_PURCHASE_COMMAND,
    hint: observabilityPlusPurchaseHint(),
    when: 'a person has approved buying the add-on',
  };
}

function inferDenialReason(message: string): string | undefined {
  if (/(?:disabled|switched off|re-enable)/i.test(message)) {
    return 'subscription_disabled';
  }
  if (/excluded from it|include the project/i.test(message)) {
    return 'project_excluded';
  }
  if (
    /upgrade your plan/i.test(message) &&
    /pro and enterprise/i.test(message)
  ) {
    return 'plan_upgrade_required';
  }
  if (/(?:quota|usage limit|query limit)/i.test(message)) {
    return 'quota';
  }
}

function plusNeedsPlanUpgradeHint(): string {
  return `Observability Plus is available on Pro and Enterprise. Upgrade with ${getCommandName(BUY_PRO_COMMAND)}. The add-on cannot be purchased on Hobby.`;
}

/** A disabled feature and a missing subscription require different actions. */
export function observabilityPlusRecovery(
  message: string,
  denialReason?: string,
  plan?: string
): ObservabilityPlusFix | undefined {
  if (!mentionsObservabilityPlus(message)) return;
  switch (denialReason ?? inferDenialReason(message)) {
    case 'subscription_disabled':
      return {
        hint: 'Observability Plus is disabled. Ask a team owner to enable it for the intended team or project, then retry. A new subscription may not be needed.',
      };
    case 'project_excluded':
      return {
        command: PROJECT_ENABLE_COMMAND,
        // Enable has no `--yes` and cannot confirm a charge without a person,
        // so a copied `--non-interactive` would only make the next run refuse.
        excludeFlags: ['--non-interactive', '--project', '--yes'],
        hint: `Observability Plus is on for the team, but this project is excluded. Enable it with ${getCommandName(PROJECT_ENABLE_COMMAND)}. A new subscription is not needed.`,
        preserveProject: false,
        when: 'a person has approved enabling Observability Plus for this project',
      };
    case 'plan_upgrade_required':
      return buyProFix(plusNeedsPlanUpgradeHint());
    case 'quota':
      return {
        hint: 'The usage limit was reached. Ask a team owner to review the limit before retrying.',
      };
    default:
      if (isHobbyLikePlan(plan)) {
        return buyProFix(plusNeedsPlanUpgradeHint());
      }
      return {
        ...observabilityPlusPurchaseFix(),
        hint: `Check whether Observability Plus is disabled for this project or the team needs a subscription. Enable it if already subscribed. Otherwise, ${observabilityPlusPurchaseHint()}`,
        when: 'the team has no subscription and a person has approved buying the add-on',
      };
  }
}

/**
 * Priority enable cannot complete unattended: there is no `--yes`. The hint
 * is the command. A caller that also prints `next` should skip a hint that
 * only repeats that command. On Hobby the next step is Pro, not enable —
 * Front sends Hobby there too, and enable would only restate the plan gate.
 */
export function priorityProjectRecovery(
  message: string,
  plan?: string
): ObservabilityPlusFix | undefined {
  if (!mentionsPriorityProject(message)) return;
  if (isHobbyLikePlan(plan)) {
    return buyProFix(
      `Priority Projects are only available on Pro or Enterprise team plans. Upgrade with ${getCommandName(BUY_PRO_COMMAND)}, then run ${getCommandName(PRIORITY_PROJECT_ENABLE_COMMAND)}.`
    );
  }
  return {
    command: PRIORITY_PROJECT_ENABLE_COMMAND,
    excludeFlags: ['--non-interactive', '--project', '--yes'],
    hint: getCommandName(PRIORITY_PROJECT_ENABLE_COMMAND),
    preserveProject: false,
    when: 'user runs this command in an interactive terminal',
  };
}

/**
 * The 402 named one product. Prefer Priority when the API said that, else
 * Observability Plus — never both, and never Plus for a Priority refusal.
 * Hobby still follows that product, but the command is `buy pro`.
 */
export function observabilityPlanRecovery(
  message: string,
  denialReason?: string,
  plan?: string
): ObservabilityPlusFix | undefined {
  return (
    priorityProjectRecovery(message, plan) ??
    observabilityPlusRecovery(message, denialReason, plan)
  );
}

/** Recovery commands that take the project as a positional `[name]`. */
const PROJECT_POSITIONAL_COMMANDS = new Set([
  PRIORITY_PROJECT_ENABLE_COMMAND,
  PROJECT_ENABLE_COMMAND,
]);

/**
 * The `--scope` value for the team the refused request ran against: the
 * slug when a prior lookup cached it, else the team id (which `--scope`
 * also accepts).
 */
export function currentTeamScope(client?: Client): string | undefined {
  const id = client?.config?.currentTeam;
  if (!id) return;
  return teamCache.get(id)?.slug ?? id;
}

/**
 * Pin a recovery to the team and project the refusal was about. Run on its
 * own, `buy pro`, `buy addon` and `project ... enable <name>` resolve the
 * globally selected team, not a linked project's, so they could charge a
 * different team or find a same-named project there. The hint names the
 * same commands, so it is rewritten to match.
 */
export function targetRecovery(
  fix: ObservabilityPlusFix | undefined,
  target: { projectName?: string; scope?: string }
): ObservabilityPlusFix | undefined {
  if (!fix) return;
  const targeted = (command: string): string => {
    let out = command;
    if (target.projectName && PROJECT_POSITIONAL_COMMANDS.has(command)) {
      out += ` ${quoteArg(target.projectName)}`;
    }
    if (target.scope) {
      out += ` --scope ${quoteArg(target.scope)}`;
    }
    return out;
  };

  let hint = fix.hint;
  for (const command of [
    BUY_PRO_COMMAND,
    OBSERVABILITY_PLUS_PURCHASE_COMMAND,
    PRIORITY_PROJECT_ENABLE_COMMAND,
    PROJECT_ENABLE_COMMAND,
  ]) {
    hint = hint
      .split(getCommandName(command))
      .join(getCommandName(targeted(command)));
  }
  if (!fix.command) return { ...fix, hint };

  const excludeFlags = new Set(fix.excludeFlags ?? []);
  let preserveProject = fix.preserveProject;
  if (target.projectName && PROJECT_POSITIONAL_COMMANDS.has(fix.command)) {
    excludeFlags.add('--project');
    preserveProject = false;
  }
  if (fix.command === BUY_PRO_COMMAND) {
    excludeFlags.add('--project');
  }
  if (target.scope) {
    excludeFlags.add('--scope');
    excludeFlags.add('--team');
  }
  return {
    ...fix,
    command: targeted(fix.command),
    hint,
    ...(excludeFlags.size ? { excludeFlags: Array.from(excludeFlags) } : {}),
    ...(preserveProject !== undefined ? { preserveProject } : {}),
  };
}

/**
 * `observabilityPlanRecovery` for a 402 the client just received, pinned
 * to the team it was sent to and, when known, the project it was about.
 *
 * `scope` is that team (slug or id). Its plan comes only from `teamCache`.
 * Callers that omit it queried the selected team, so the selected plan and
 * scope still apply.
 */
export function clientObservabilityPlanRecovery(
  client: Client | undefined,
  error: unknown,
  message: string,
  projectName?: string,
  scope?: string
): ObservabilityPlusFix | undefined {
  return targetRecovery(
    observabilityPlanRecovery(
      message,
      observabilityPlusDenialReason(error),
      scope ? planForTeam(scope) : currentTeamPlan(client)
    ),
    { projectName, scope: scope ?? currentTeamScope(client) }
  );
}
