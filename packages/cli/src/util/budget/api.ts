import type Client from '../client';
import getWebhook from '../webhooks/get-webhook';

export type BudgetThreshold = {
  percent: number;
  sendNotifications: boolean;
  triggerWebhook: boolean;
  pauseUsage: boolean;
};

/**
 * Every scope `GET /v1/budgets` can list. `set`, `remove`, `inspect`, and
 * `alerts` only target `team` or `organization`, through `BudgetSelector`.
 */
export type BudgetScope = 'team' | 'organization' | 'project' | 'product';

/**
 * Pins which budget row list/set/remove/spend talk to.
 */
export type BudgetSelector = { scope: 'team' } | { scope: 'organization' };

export const TEAM_BUDGET: BudgetSelector = { scope: 'team' };

/** Budget row as `GET /v1/budgets` returns it. */
export interface Budget {
  id: string;
  ownerId: string;
  planId: string;
  /** Whole dollars, serialized as a string. */
  amount: string;
  status: 'active' | 'disabled';
  createdAt: string;
  thresholds: BudgetThreshold[];
  webhookId?: string;
  statusChangedAt?: string;
  scope?: BudgetScope;
  scopeId?: string;
}

export interface SetBudgetInput {
  /** Whole dollars, minimum 1. */
  amount: number;
  thresholds: BudgetThreshold[];
  webhookUrl?: string;
}

/** `POST /v1/budgets` returns only this; the budget row is a follow-up GET. */
export type SetBudgetResult = { webhookSecret?: string };

/** Cents. `currentSpend` is null when there is no active subscription or upcoming invoice. */
export interface TeamSpend {
  currentSpend: number | null;
  avgSpend: number | null;
  prevMonthSpend?: number;
}

export type WebhookStatus = 'absent' | 'resolved' | 'unavailable';

/** Same percents and flags as the dashboard's `buildBudgetThresholds`. */
export const BUDGET_THRESHOLD_PERCENTS = [50, 75, 100] as const;

/** `--pause` only ever sets `pauseUsage` on this percent. */
export const PAUSE_AT_PERCENT = 100;

export function buildThresholds({
  pause,
  webhookUrl,
}: {
  pause?: boolean;
  webhookUrl?: string;
}): BudgetThreshold[] {
  return BUDGET_THRESHOLD_PERCENTS.map(percent => ({
    percent,
    sendNotifications: true,
    triggerWebhook: Boolean(webhookUrl),
    pauseUsage: percent === PAUSE_AT_PERCENT ? Boolean(pause) : false,
  }));
}

/**
 * Create uses dashboard defaults. Update keeps existing percents and
 * notification flags, and only changes pause/webhook when those flags
 * were passed.
 */
export function thresholdsForSet({
  existing,
  pause,
  pauseSpecified,
  webhookUrl,
  webhookSpecified,
}: {
  existing?: BudgetThreshold[];
  pause: boolean;
  pauseSpecified: boolean;
  webhookUrl?: string;
  webhookSpecified: boolean;
}): BudgetThreshold[] {
  if (!existing?.length) {
    return buildThresholds({ pause, webhookUrl });
  }

  let next = existing.map(threshold => ({ ...threshold }));
  if (pauseSpecified) {
    next = applyPauseToThresholds(next, pause);
  }
  if (webhookSpecified) {
    const triggerWebhook = Boolean(webhookUrl);
    next = next.map(threshold => ({ ...threshold, triggerWebhook }));
  }
  return next;
}

export function hasPauseThreshold(thresholds: BudgetThreshold[]): boolean {
  return thresholds.some(threshold => threshold.percent === PAUSE_AT_PERCENT);
}

/** Percents that would pause somewhere other than 100%. */
export function pausePercentsOutside100(
  thresholds: BudgetThreshold[]
): number[] {
  return thresholds
    .filter(
      threshold =>
        threshold.pauseUsage && threshold.percent !== PAUSE_AT_PERCENT
    )
    .map(threshold => threshold.percent);
}

export function applyPauseToThresholds(
  thresholds: BudgetThreshold[],
  pause: boolean
): BudgetThreshold[] {
  if (!pause) {
    return thresholds.map(threshold => ({ ...threshold, pauseUsage: false }));
  }
  return thresholds.map(threshold => ({
    ...threshold,
    pauseUsage: threshold.percent === PAUSE_AT_PERCENT,
  }));
}

export function budgetAmountDollars(budget: Pick<Budget, 'amount'>): number {
  const n = Number(budget.amount);
  return Number.isFinite(n) ? n : 0;
}

/** The spend endpoint reports cents; budgets, JSON, and tables use dollars. */
export function spendDollars(spend: TeamSpend | null): number | null {
  return spend?.currentSpend == null ? null : spend.currentSpend / 100;
}

export function percentUsed(
  spent: number | null,
  amount: number
): number | null {
  return spent !== null && amount > 0
    ? Math.round((spent / amount) * 100)
    : null;
}

/** The `spend` object in `inspect` and `list` JSON. */
export function spendPayload(spent: number | null, amount: number | null) {
  return {
    currentSpend: spent,
    percentUsed: amount === null ? null : percentUsed(spent, amount),
    unit: 'usd' as const,
  };
}

/**
 * For optional context (spend, recent alerts): fail on the first error
 * instead of retrying, so a 5xx or 429 doesn't stall the command.
 */
export const NO_RETRY = { retries: 0 } as const;

type FetchRetry = { retry?: { retries: number } };

export function budgetPauses(budget: Pick<Budget, 'thresholds'>): boolean {
  return budget.thresholds.some(t => t.pauseUsage);
}

export type BudgetTeam = {
  id: string;
  slug: string;
};

/** Fields we always print from inspect, set, list, and JSON. */
export type BudgetState = {
  id: string;
  teamId: string;
  scope: BudgetScope;
  /** Project or product id for those scopes; null for `team` and `organization`. */
  scopeId: string | null;
  amount: number;
  amountUnit: 'usd';
  status: Budget['status'];
  pause: boolean;
  webhookId: string | null;
  webhookUrl: string | null;
  webhookStatus: WebhookStatus;
  thresholds: BudgetThreshold[];
};

export function budgetStatePayload(state: BudgetState) {
  return {
    id: state.id,
    teamId: state.teamId,
    scope: state.scope,
    scopeId: state.scopeId,
    amount: state.amount,
    amountUnit: state.amountUnit,
    status: state.status,
    pause: state.pause,
    webhookId: state.webhookId,
    webhookUrl: state.webhookUrl,
    webhookStatus: state.webhookStatus,
    thresholds: state.thresholds,
  };
}

export function setSavedReceipt({
  team,
  reloaded,
  webhookSecret,
  amount,
  scope,
}: {
  team: BudgetTeam;
  reloaded: BudgetState | null;
  webhookSecret?: string;
  amount: number;
  scope: BudgetScope;
}) {
  const secret = webhookSecret ? { webhookSecret } : {};
  if (reloaded) {
    return {
      ok: true as const,
      saved: true as const,
      reloaded: true as const,
      teamSlug: team.slug,
      ...budgetStatePayload(reloaded),
      ...secret,
    };
  }
  return {
    ok: true as const,
    saved: true as const,
    reloaded: false as const,
    teamId: team.id,
    teamSlug: team.slug,
    scope,
    amount,
    amountUnit: 'usd' as const,
    ...secret,
  };
}

export function removeReceipt({
  team,
  alreadyAbsent,
  disabled,
  scope,
}: {
  team: BudgetTeam;
  alreadyAbsent: boolean;
  disabled: string | null;
  scope: BudgetScope;
}) {
  return {
    ok: true as const,
    alreadyAbsent,
    disabled,
    teamId: team.id,
    teamSlug: team.slug,
    scope,
  };
}

function selectorQuery(selector: BudgetSelector): string {
  return new URLSearchParams({ scope: selector.scope }).toString();
}

function matchesSelector(budget: Budget, selector: BudgetSelector): boolean {
  const scope = budget.scope ?? selector.scope;
  return scope === selector.scope;
}

export function resolvedBudgetScope(
  budget: Pick<Budget, 'scope'>,
  selector: BudgetSelector = TEAM_BUDGET
): BudgetScope {
  return budget.scope ?? selector.scope;
}

export async function toBudgetState(
  client: Client,
  budget: Budget,
  selector: BudgetSelector = TEAM_BUDGET
): Promise<BudgetState> {
  const webhook = await resolveBudgetWebhook(client, budget);
  return {
    id: budget.id,
    teamId: budget.ownerId,
    scope: resolvedBudgetScope(budget, selector),
    scopeId: budget.scopeId ?? null,
    amount: budgetAmountDollars(budget),
    amountUnit: 'usd',
    status: budget.status,
    pause: budgetPauses(budget),
    webhookId: webhook.webhookId,
    webhookUrl: webhook.webhookUrl,
    webhookStatus: webhook.webhookStatus,
    thresholds: budget.thresholds.map(threshold => ({ ...threshold })),
  };
}

export async function resolveBudgetWebhookUrl(
  client: Client,
  budget: Pick<Budget, 'webhookId'>
): Promise<string | null> {
  const resolved = await resolveBudgetWebhook(client, budget);
  return resolved.webhookUrl;
}

export async function resolveBudgetWebhook(
  client: Client,
  budget: Pick<Budget, 'webhookId'>
): Promise<{
  webhookId: string | null;
  webhookUrl: string | null;
  webhookStatus: WebhookStatus;
}> {
  if (!budget.webhookId) {
    return {
      webhookId: null,
      webhookUrl: null,
      webhookStatus: 'absent',
    };
  }
  try {
    const webhook = await getWebhook(client, budget.webhookId);
    return {
      webhookId: budget.webhookId,
      webhookUrl: webhook.url,
      webhookStatus: 'resolved',
    };
  } catch {
    return {
      webhookId: budget.webhookId,
      webhookUrl: null,
      webhookStatus: 'unavailable',
    };
  }
}

/** Whole dollars, e.g. `$500` or `$5,000`. */
export function formatUsdWhole(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Dollars with cents, e.g. `$125.00` or `$1,234.56`. */
export function formatUsd(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Without a selector, lists every budget the team owns, of any scope. */
export async function listBudgets(
  client: Client,
  selector?: BudgetSelector
): Promise<Budget[]> {
  const { data } = await client.fetch<{ data: Budget[] }>(
    selector ? `/v1/budgets?${selectorQuery(selector)}` : '/v1/budgets',
    { method: 'GET' }
  );
  return data ?? [];
}

/** The active row for this selector, if any. List is already scope-filtered. */
export async function findBudget(
  client: Client,
  selector: BudgetSelector = TEAM_BUDGET
): Promise<Budget | undefined> {
  const budgets = (await listBudgets(client, selector)).filter(budget =>
    matchesSelector(budget, selector)
  );
  return budgets.find(b => b.status === 'active') ?? budgets[0];
}

export async function setBudget(
  client: Client,
  input: SetBudgetInput & BudgetSelector
): Promise<SetBudgetResult> {
  const selector: BudgetSelector = { scope: input.scope };

  return client.fetch<SetBudgetResult>('/v1/budgets', {
    method: 'POST',
    retry: { retries: 0 },
    body: {
      amount: input.amount,
      thresholds: input.thresholds,
      scope: selector.scope,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    },
  });
}

/** Disables the budget; the row is kept with `status: 'disabled'`. */
export async function removeBudget(
  client: Client,
  budgetId: string
): Promise<void> {
  await client.fetch(`/v1/budgets/${encodeURIComponent(budgetId)}`, {
    method: 'DELETE',
  });
}

export async function getTeamSpend(
  client: Client,
  teamId: string,
  selector: BudgetSelector = TEAM_BUDGET,
  { retry }: FetchRetry = {}
): Promise<TeamSpend> {
  // Unversioned: `GET /v1/teams/:id/spend` injects path `version` into the
  // query, and the spend schema rejects it (`additionalProperties: false`).
  // The team spend endpoint also rejects `scope`; omit it for the team gauge.
  const params = new URLSearchParams();
  if (selector.scope !== 'team') {
    params.set('scope', selector.scope);
  }
  const qs = params.toString();
  const { data } = await client.fetch<{ data: TeamSpend }>(
    `/teams/${encodeURIComponent(teamId)}/spend${qs ? `?${qs}` : ''}`,
    { method: 'GET', ...(retry ? { retry } : {}) }
  );
  return data ?? { currentSpend: null, avgSpend: null };
}

/**
 * One threshold crossing as `GET /v1/budgets/alerts` returns it. The threshold
 * flags are what it was configured to do when it fired, not whether the action
 * ran. `budgetId` may name a budget that has since been deleted.
 */
export interface BudgetAlert {
  id: string;
  budgetId: string;
  scope: BudgetScope;
  /** Epoch ms. */
  triggeredAt: number;
  /** Epoch ms. */
  period: { start: number; end: number };
  /** USD decimal string. */
  budgetAmount: string;
  /** USD decimal string: spend when the alert fired. */
  spent: string;
  threshold: BudgetThreshold & { amount: string };
}

export interface BudgetAlertsPage {
  data: BudgetAlert[];
  nextCursor?: string;
}

export interface BudgetAlertsQuery {
  budgetId?: string;
  /** Epoch ms. */
  since?: number;
  /** Epoch ms. */
  until?: number;
  /** 1–100; the API defaults to 20. */
  limit?: number;
  cursor?: string;
}

export async function listBudgetAlerts(
  client: Client,
  selector: BudgetSelector = TEAM_BUDGET,
  query: BudgetAlertsQuery = {},
  { retry }: FetchRetry = {}
): Promise<BudgetAlertsPage> {
  const params = new URLSearchParams(selectorQuery(selector));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const page = await client.fetch<BudgetAlertsPage>(
    `/v1/budgets/alerts?${params}`,
    { method: 'GET', ...(retry ? { retry } : {}) }
  );
  return { data: page.data ?? [], nextCursor: page.nextCursor };
}
