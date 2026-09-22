import chalk from 'chalk';
import { ACTION_COLORS } from './format-utils';
import type {
  FirewallConfigResponse,
  FirewallConfigChange,
  FirewallChangeAction,
  FirewallRule,
  FirewallConditionGroup,
  FirewallCondition,
  FirewallRuleAction,
  FirewallIpRule,
  BypassRule,
  ManagedRuleConfig,
  ManagedRulesResponse,
} from './types';
import { formatAlignedLabel } from '../output/print-aligned-label';

export interface AttackModeStatus {
  enabled: boolean;
  /** Epoch milliseconds */
  activeUntil?: number | null;
}

/**
 * Shown in place of a value the account's plan has no access to.
 *
 * Names the qualifying plans rather than only reporting the absence, so the
 * row says what to do about it. The API's own 402 message says the same thing
 * at greater length; it is deliberately not used here, because this renders as
 * a fixed-width table cell that unbounded server-controlled text would break.
 * The JSON output carries that message instead.
 */
const PLAN_UNAVAILABLE = 'Requires Pro or Enterprise';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** Render a duration as `1h 30m`. */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  return `${hours}h ${minutes}m`;
}

export function isAllSourcesBypass(ip: string): boolean {
  return ip === '0.0.0.0/0' || ip === '::/0';
}

export type MitigationsStatus =
  | { paused: false }
  /** `resumesAt` is epoch seconds; absent for a bypass with no expiry. */
  | { paused: true; resumesAt?: number };

/**
 * Latest expiry that can plausibly be epoch seconds, guarding against a value
 * in different units being read as a date tens of thousands of years out.
 */
const MAX_EXPIRY_SECONDS = 4102444800; // 2100-01-01

/**
 * Parse the expiry of a project bypass entry, in epoch seconds.
 *
 * Returns `null` when the bypass is open-ended: either it carries no expiry, or
 * the expiry cannot be interpreted. An uninterpretable expiry is deliberately
 * not discarded — the entry still proves a bypass exists, and on a plan-gated
 * account this is the only evidence of one, so reporting mitigations as active
 * would be the more dangerous reading.
 */
function parseExpirySeconds(expiry: string | undefined): number | null {
  if (!expiry || !/^\d+$/.test(expiry)) return null;

  const seconds = Number(expiry);
  return Number.isSafeInteger(seconds) && seconds <= MAX_EXPIRY_SECONDS
    ? seconds
    : null;
}

/**
 * Expiry of every all-sources bypass in effect, in epoch seconds, using `null`
 * for one that is open-ended.
 *
 * Both sources are read. The project's `firewallBypassIps` is not plan-gated,
 * so it is the only source on plans without IP Bypass; the bypass API is
 * consulted when readable so that a bypass which was never mirrored onto the
 * project is still accounted for.
 */
function allSourcesBypassExpiries(
  firewallBypassIps: string[] = [],
  bypass: BypassRule[] | null = []
): (number | null)[] {
  const expiries: (number | null)[] = [];

  // Entries are encoded as `<cidr>#<epoch-seconds>` by the bypass API, the
  // expiry omitted when the bypass is permanent. They carry no domain: the API
  // only records them on the project for a project-scoped bypass, which its
  // request schema makes mutually exclusive with a domain-scoped one.
  for (const entry of firewallBypassIps) {
    const [ip, expiry] = entry.split('#');
    if (!isAllSourcesBypass(ip)) continue;
    expiries.push(parseExpirySeconds(expiry));
  }

  for (const rule of bypass ?? []) {
    if (!isAllSourcesBypass(rule.Ip) || rule.Domain !== '*') continue;
    expiries.push(rule.ExpiresAt ?? null);
  }

  return expiries;
}

/**
 * Whether system mitigations are paused, which is the case while an all-sources
 * system bypass is in effect. A permanent bypass keeps them paused indefinitely;
 * otherwise they resume when the last bypass expires.
 */
export function getMitigationsStatus(
  firewallBypassIps?: string[],
  bypass?: BypassRule[] | null
): MitigationsStatus {
  const expiries = allSourcesBypassExpiries(firewallBypassIps, bypass);
  if (expiries.includes(null)) return { paused: true };

  const nowSeconds = Date.now() / MS_PER_SECOND;
  const unexpired = expiries.filter(
    (expiry): expiry is number => expiry !== null && expiry > nowSeconds
  );

  return unexpired.length
    ? { paused: true, resumesAt: Math.max(...unexpired) }
    : { paused: false };
}

export function formatAttackModeStatus(status: AttackModeStatus): string {
  if (!status.enabled) {
    return chalk.dim('Off');
  }
  if (status.activeUntil) {
    const remainingMs = status.activeUntil - Date.now();
    if (remainingMs <= 0) {
      return chalk.dim('Off (expired)');
    }
    return chalk.red(`On (expires in ${formatDuration(remainingMs)})`);
  }
  return chalk.red('On');
}

export function formatMitigationsStatus(status: MitigationsStatus): string {
  if (!status.paused) return chalk.green('Active');

  if (status.resumesAt !== undefined) {
    const remainingMs = status.resumesAt * MS_PER_SECOND - Date.now();
    if (remainingMs > 0) {
      return chalk.yellow(
        `Paused (auto-resumes in ${formatDuration(remainingMs)})`
      );
    }
  }
  return chalk.yellow('Paused');
}

/**
 * Firewall configuration in execution order:
 * Bypass -> Mitigations -> Attack Mode -> IP Blocks -> Rules -> Bot Protection
 * -> AI Bots -> OWASP.
 *
 * Shared by `firewall status` and `firewall overview`, which renders this
 * block and then adds traffic and alert activity beneath it.
 */
export function formatStatusOutput(opts: {
  active: FirewallConfigResponse | null;
  draft: FirewallConfigResponse | null;
  /** Bypass rules, or `null` when the bypass API is gated on the plan. */
  bypass: BypassRule[] | null;
  attackMode?: AttackModeStatus;
  /** Decides whether OWASP reports the upgrade it needs. */
  planInfo?: FirewallPlanInfo;
  /**
   * The project's `security.firewallBypassIps`. Not plan-gated, so it carries
   * mitigation status even when `bypass` is unavailable.
   */
  firewallBypassIps?: string[];
}): string {
  const { active, draft, bypass, attackMode, planInfo, firewallBypassIps } =
    opts;
  const lines: string[] = [];

  lines.push(
    formatAlignedLabel(
      'Firewall',
      active
        ? active.firewallEnabled
          ? chalk.green('Enabled')
          : chalk.red('Disabled')
        : chalk.dim('Not configured')
    )
  );

  if (bypass === null) {
    lines.push(formatAlignedLabel('Bypass', chalk.dim(PLAN_UNAVAILABLE)));
  } else {
    // The all-sources bypass represents system mitigations, reported below.
    const regularBypasses = bypass.filter(b => !isAllSourcesBypass(b.Ip));
    lines.push(
      formatAlignedLabel(
        'Bypass',
        `${regularBypasses.length} IP${regularBypasses.length !== 1 ? 's' : ''}`
      )
    );
  }
  lines.push(
    formatAlignedLabel(
      'Mitigations',
      formatMitigationsStatus(getMitigationsStatus(firewallBypassIps, bypass))
    )
  );

  if (attackMode) {
    lines.push(
      formatAlignedLabel('Attack Mode', formatAttackModeStatus(attackMode))
    );
  }

  if (active) {
    lines.push(formatAlignedLabel('IP Blocks', String(active.ips.length)));

    const activeRules = active.rules.filter(r => r.active).length;
    const inactiveRules = active.rules.filter(r => !r.active).length;
    lines.push(
      formatAlignedLabel(
        'Rules',
        `${activeRules} active, ${inactiveRules} inactive (${active.rules.length} total)`
      )
    );
  }

  lines.push(
    formatAlignedLabel(
      'Bot Protection',
      formatBotProtectionStatus(getBotProtectionConfig(active?.managedRules))
    )
  );
  lines.push(
    formatAlignedLabel(
      'AI Bots',
      formatAiBotsStatus(active?.managedRules?.ai_bots)
    )
  );
  lines.push(
    formatAlignedLabel(
      'OWASP',
      formatOwaspStatus(active?.managedRules?.owasp, planInfo)
    )
  );

  if (draft && draft.changes.length > 0) {
    lines.push('');
    lines.push(
      formatAlignedLabel(
        'Draft',
        chalk.yellow(
          `${draft.changes.length} unpublished change${draft.changes.length !== 1 ? 's' : ''}`
        )
      )
    );
    const activeRulesMap = new Map((active?.rules || []).map(r => [r.id, r]));
    lines.push(formatDiffOutput(draft.changes, activeRulesMap));
  }

  return lines.join('\n');
}

export function formatBypassTable(bypasses: BypassRule[]): string {
  const lines: string[] = [];

  const domains = bypasses.map(b =>
    b.Domain === '*' ? 'All domains' : b.Domain
  );
  const ipWidth = Math.max('IP/CIDR'.length, ...bypasses.map(b => b.Ip.length));
  const domainWidth = Math.max('Domain'.length, ...domains.map(d => d.length));
  const gap = 3;

  // Header
  lines.push(
    `  ${chalk.dim('IP/CIDR'.padEnd(ipWidth + gap))}${chalk.dim('Domain'.padEnd(domainWidth + gap))}${chalk.dim('Note')}`
  );

  for (let i = 0; i < bypasses.length; i++) {
    const bypass = bypasses[i];
    const ip = bypass.Ip.padEnd(ipWidth + gap);
    const domain = domains[i].padEnd(domainWidth + gap);
    const note = bypass.Note || '';
    lines.push(`  ${ip}${domain}${note}`);
  }

  return lines.join('\n');
}

export type IpBlockStatus = 'live' | 'added' | 'removed' | 'modified';

export interface AnnotatedIpRule {
  rule: FirewallIpRule;
  status: IpBlockStatus;
}

/**
 * Build an annotated list of IP rules showing draft state.
 * Cross-references draft changes to determine each rule's status.
 */
export function annotateIpRules(
  activeIps: FirewallIpRule[],
  draftIps: FirewallIpRule[] | null,
  changes: FirewallConfigChange[]
): AnnotatedIpRule[] {
  if (!draftIps) {
    return activeIps.map(rule => ({ rule, status: 'live' as IpBlockStatus }));
  }

  const addedIds = new Set(
    changes
      .filter(c => c.action === 'ip.insert')
      .map(c => c.id)
      .filter((id): id is string => id !== null && id !== undefined)
  );
  const removedIds = new Set(
    changes
      .filter(c => c.action === 'ip.remove')
      .map(c => c.id)
      .filter((id): id is string => id !== null && id !== undefined)
  );
  const modifiedIds = new Set(
    changes
      .filter(c => c.action === 'ip.update')
      .map(c => c.id)
      .filter((id): id is string => id !== null && id !== undefined)
  );

  const result: AnnotatedIpRule[] = [];

  // Add all draft IPs with their status
  for (const rule of draftIps) {
    if (addedIds.has(rule.id)) {
      result.push({ rule, status: 'added' });
    } else if (modifiedIds.has(rule.id)) {
      result.push({ rule, status: 'modified' });
    } else {
      result.push({ rule, status: 'live' });
    }
  }

  // Add removed rules (in active but not in draft)
  for (const rule of activeIps) {
    if (removedIds.has(rule.id)) {
      result.push({ rule, status: 'removed' });
    }
  }

  return result;
}

export function formatIpBlocksTable(annotated: AnnotatedIpRule[]): string {
  const lines: string[] = [];

  const hostnames = annotated.map(a =>
    a.rule.hostname === '*' || a.rule.hostname === ''
      ? 'All hosts'
      : a.rule.hostname
  );
  const gap = 3;
  const prefixWidth = 2; // "  " or "+ " or "- " or "~ "
  const ipWidth = Math.max(
    'IP/CIDR'.length,
    ...annotated.map(a => a.rule.ip.length)
  );
  const hostnameWidth = Math.max(
    'Hostname'.length,
    ...hostnames.map(h => h.length)
  );

  // Header
  lines.push(
    `  ${' '.repeat(prefixWidth)}${chalk.dim('IP/CIDR'.padEnd(ipWidth + gap))}${chalk.dim('Hostname'.padEnd(hostnameWidth + gap))}${chalk.dim('Notes')}`
  );

  for (let i = 0; i < annotated.length; i++) {
    const { rule, status } = annotated[i];
    const ip = rule.ip.padEnd(ipWidth + gap);
    const hostname = hostnames[i].padEnd(hostnameWidth + gap);
    const notes = rule.notes || '';

    let prefix = '  ';
    let colorFn: (s: string) => string = (s: string) => s;

    if (status === 'added') {
      prefix = '+ ';
      colorFn = chalk.green;
    } else if (status === 'removed') {
      prefix = '- ';
      colorFn = chalk.red;
    } else if (status === 'modified') {
      prefix = '~ ';
      colorFn = chalk.yellow;
    }

    lines.push(colorFn(`  ${prefix}${ip}${hostname}${notes}`));
  }

  return lines.join('\n');
}

export function getDiffSymbol(action: FirewallChangeAction): {
  symbol: string;
  color: (text: string) => string;
} {
  if (action.endsWith('.insert')) {
    return { symbol: '+', color: chalk.green };
  }
  if (action.endsWith('.remove')) {
    return { symbol: '-', color: chalk.red };
  }
  return { symbol: '~', color: chalk.yellow };
}

export function formatChangeDescription(
  change: FirewallConfigChange,
  activeRules?: Map<string, FirewallRule>
): string {
  const { action, id, value } = change;

  switch (action) {
    case 'rules.insert': {
      const rule = value as { name?: string } | undefined;
      return `Added rule "${rule?.name || id || 'unknown'}"`;
    }
    case 'rules.update': {
      const draft = value as
        | {
            name?: string;
            active?: boolean;
            conditionGroup?: FirewallConditionGroup[];
            action?: FirewallRuleAction;
            description?: string;
          }
        | undefined;
      const ruleName = draft?.name || id || 'unknown';

      // Detect enable/disable-only changes by comparing against active rule
      if (activeRules && id && draft && typeof draft.active === 'boolean') {
        const activeRule = activeRules.get(id);
        if (activeRule && activeRule.active !== draft.active) {
          // Check if other fields are unchanged
          const nameUnchanged = activeRule.name === draft.name;
          const conditionsUnchanged =
            JSON.stringify(activeRule.conditionGroup) ===
            JSON.stringify(draft.conditionGroup);
          const actionUnchanged =
            JSON.stringify(activeRule.action) === JSON.stringify(draft.action);
          const descriptionUnchanged =
            (activeRule.description || '') === (draft.description || '');

          if (
            nameUnchanged &&
            conditionsUnchanged &&
            actionUnchanged &&
            descriptionUnchanged
          ) {
            return draft.active
              ? `Enabled rule "${ruleName}"`
              : `Disabled rule "${ruleName}"`;
          }
        }
      }

      return `Modified rule "${ruleName}"`;
    }
    case 'rules.remove':
      return `Removed rule "${id || 'unknown'}"`;
    case 'rules.priority': {
      const rule = value as { name?: string } | undefined;
      return `Reordered rule "${rule?.name || id || 'unknown'}"`;
    }
    case 'ip.insert': {
      const ip = value as { ip?: string } | undefined;
      return `Added IP block ${ip?.ip || 'unknown'}`;
    }
    case 'ip.remove':
      return `Removed IP block ${id || 'unknown'}`;
    case 'ip.update': {
      const ip = value as { ip?: string } | undefined;
      return `Modified IP block ${ip?.ip || id || 'unknown'}`;
    }
    case 'firewallEnabled':
      return `${value ? 'Enabled' : 'Disabled'} firewall`;
    case 'crs.update':
      return 'Updated OWASP CRS configuration';
    case 'crs.disable':
      return 'Disabled OWASP CRS';
    case 'managedRules.update':
      return 'Updated managed ruleset configuration';
    case 'managedRuleGroup.update':
      return 'Updated managed rule group';
    case 'botId.toggle':
      return `${value ? 'Enabled' : 'Disabled'} Bot ID detection`;
    case 'ja3Enabled':
      return `${value ? 'Enabled' : 'Disabled'} JA3 fingerprinting`;
    case 'ja4Enabled':
      return `${value ? 'Enabled' : 'Disabled'} JA4 fingerprinting`;
    case 'logHeaders.update':
      return 'Updated log headers configuration';
    default:
      return `${action}${id ? ` (${id})` : ''}`;
  }
}

/**
 * Generate field-level diff lines for a rules.update change.
 * Compares the active rule against the draft value and returns
 * indented sub-lines showing what changed.
 */
export function formatRuleFieldDiff(
  activeRule: FirewallRule,
  draftValue: {
    name?: string;
    conditionGroup?: FirewallConditionGroup[];
    action?: FirewallRuleAction;
  }
): string[] {
  const lines: string[] = [];

  // Name change
  if (draftValue.name && activeRule.name !== draftValue.name) {
    lines.push(
      chalk.yellow(`      ~ Name: "${activeRule.name}" → "${draftValue.name}"`)
    );
  }

  // Action change
  if (
    draftValue.action &&
    JSON.stringify(activeRule.action) !== JSON.stringify(draftValue.action)
  ) {
    const oldAction = formatActionDisplay(activeRule.action);
    const newAction = formatActionDisplay(draftValue.action);
    lines.push(chalk.yellow(`      ~ Action: ${oldAction} → ${newAction}`));
  }

  // Condition changes — flat set comparison using formatConditionCompact
  if (
    draftValue.conditionGroup &&
    JSON.stringify(activeRule.conditionGroup) !==
      JSON.stringify(draftValue.conditionGroup)
  ) {
    const oldConditions = new Set(
      activeRule.conditionGroup.flatMap(g =>
        g.conditions.map(c => formatConditionCompact(c))
      )
    );
    const newConditions = new Set(
      draftValue.conditionGroup.flatMap(g =>
        g.conditions.map(c => formatConditionCompact(c))
      )
    );

    const added = [...newConditions].filter(c => !oldConditions.has(c));
    const removed = [...oldConditions].filter(c => !newConditions.has(c));

    for (const c of added) {
      lines.push(chalk.green(`      + Condition: ${c}`));
    }
    for (const c of removed) {
      lines.push(chalk.red(`      - Condition: ${c}`));
    }

    // If no individual conditions changed but the grouping (AND/OR structure) did
    if (added.length === 0 && removed.length === 0) {
      lines.push(chalk.yellow('      ~ Condition groups restructured'));
    }
  }

  return lines;
}

// Sort order for diff change actions — most impactful first
const CHANGE_ACTION_ORDER: Record<string, number> = {
  firewallEnabled: 0,
  'rules.insert': 1,
  'rules.update': 2,
  'rules.remove': 3,
  'rules.priority': 4,
  'ip.insert': 5,
  'ip.update': 6,
  'ip.remove': 7,
  'crs.update': 8,
  'crs.disable': 9,
  'managedRules.update': 10,
  'managedRuleGroup.update': 11,
  'botId.toggle': 12,
  ja3Enabled: 13,
  ja4Enabled: 14,
  'logHeaders.update': 15,
};

export function formatDiffOutput(
  changes: FirewallConfigChange[],
  activeRules?: Map<string, FirewallRule>
): string {
  const lines: string[] = [];

  // Sort changes: firewall toggle first, then rules, IPs, system config
  const sorted = [...changes].sort(
    (a, b) =>
      (CHANGE_ACTION_ORDER[a.action] ?? 99) -
      (CHANGE_ACTION_ORDER[b.action] ?? 99)
  );

  for (const change of sorted) {
    const { symbol, color } = getDiffSymbol(change.action);
    const description = formatChangeDescription(change, activeRules);
    lines.push(color(`  ${symbol} ${description}`));

    // For rules.update, show field-level diff sub-lines
    if (change.action === 'rules.update' && activeRules && change.id) {
      const activeRule = activeRules.get(change.id);
      if (activeRule && change.value) {
        const subLines = formatRuleFieldDiff(
          activeRule,
          change.value as {
            name?: string;
            conditionGroup?: FirewallConditionGroup[];
            action?: FirewallRuleAction;
          }
        );
        lines.push(...subLines);
      }
    }
  }

  return lines.join('\n');
}

// --- Rule formatting helpers ---

const OPERATOR_LABELS: Record<string, string> = {
  eq: 'equals',
  neq: 'does not equal',
  re: 'matches regex',
  ex: 'exists',
  nex: 'does not exist',
  inc: 'is any of',
  ninc: 'is not any of',
  pre: 'starts with',
  suf: 'ends with',
  sub: 'contains',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const NEGATED_OPERATOR_LABELS: Record<string, string> = {
  eq: 'does not equal',
  neq: 'equals',
  re: 'does not match regex',
  ex: 'does not exist',
  nex: 'exists',
  inc: 'is not any of',
  ninc: 'is any of',
  pre: 'does not start with',
  suf: 'does not end with',
  sub: 'does not contain',
  gt: 'NOT >',
  gte: 'NOT >=',
  lt: 'NOT <',
  lte: 'NOT <=',
};

const CONDITION_TYPE_LABELS: Record<string, string> = {
  path: 'path',
  raw_path: 'raw path',
  target_path: 'target path',
  route: 'route',
  server_action: 'server action',
  method: 'method',
  host: 'host',
  protocol: 'protocol',
  scheme: 'scheme',
  environment: 'environment',
  region: 'region',
  ip_address: 'IP address',
  user_agent: 'user agent',
  geo_country: 'geo country',
  geo_continent: 'geo continent',
  geo_country_region: 'state/region',
  geo_city: 'geo city',
  geo_as_number: 'geo AS number',
  header: 'header',
  cookie: 'cookie',
  query: 'query string',
  ja3_digest: 'JA3 digest',
  ja4_digest: 'JA4 digest',
  request_body: 'request body',
  rate_limit_api_id: 'rate limit API ID',
  bot_name: 'bot name',
  bot_category: 'bot category',
};

function getConditionTypeLabel(type: string, key?: string): string {
  const label = CONDITION_TYPE_LABELS[type] || type;
  if (key) return `${label}[${key}]`;
  return label;
}

function getOperatorLabel(op: string, neg?: boolean): string {
  if (neg) {
    return NEGATED_OPERATOR_LABELS[op] || `NOT ${OPERATOR_LABELS[op] || op}`;
  }
  return OPERATOR_LABELS[op] || op;
}

function formatConditionValue(condition: FirewallCondition): string {
  if (condition.op === 'ex' || condition.op === 'nex') {
    return '';
  }
  if (Array.isArray(condition.value)) {
    return condition.value.join(', ');
  }
  return String(condition.value ?? '');
}

/**
 * Format a single condition as a compact string.
 * e.g., "path starts with /api" or "header[Authorization] exists"
 */
export function formatConditionCompact(condition: FirewallCondition): string {
  const type = getConditionTypeLabel(condition.type, condition.key);
  const op = getOperatorLabel(condition.op, condition.neg);
  const value = formatConditionValue(condition);

  if (!value) return `${type} ${op}`;
  return `${type} ${op} ${value}`;
}

/**
 * Format the action for display.
 * e.g., "Deny (1h)", "Rate Limit (100/60s)", "Redirect → /new (301)"
 */
export function formatActionDisplay(action: FirewallRuleAction): string {
  const mitigate = action.mitigate;
  if (!mitigate) return chalk.dim('None');

  const actionType = mitigate.action;
  const duration = mitigate.actionDuration;

  switch (actionType) {
    case 'deny':
      return duration ? `Deny (${duration})` : 'Deny';
    case 'challenge':
      return duration ? `Challenge (${duration})` : 'Challenge';
    case 'log':
      return 'Log';
    case 'bypass':
      return 'Bypass';
    case 'rate_limit': {
      const rl = mitigate.rateLimit;
      if (rl) {
        return `Rate Limit (${rl.limit}/${rl.window}s)`;
      }
      return 'Rate Limit';
    }
    case 'redirect': {
      const rd = mitigate.redirect;
      if (rd) {
        const code = rd.permanent ? '301' : '307';
        return `Redirect → ${rd.location} (${code})`;
      }
      return 'Redirect';
    }
    default:
      return actionType;
  }
}

// --- Rules list (annotated) ---

export type RuleStatus = 'live' | 'added' | 'removed' | 'modified';

export interface AnnotatedRule {
  rule: FirewallRule;
  status: RuleStatus;
}

/**
 * Build an annotated list of rules showing draft state.
 */
export function annotateRules(
  activeRules: FirewallRule[],
  draftRules: FirewallRule[] | null,
  changes: FirewallConfigChange[]
): AnnotatedRule[] {
  if (!draftRules) {
    return activeRules.map(rule => ({ rule, status: 'live' as RuleStatus }));
  }

  const addedIds = new Set(
    changes
      .filter(c => c.action === 'rules.insert')
      .map(c => c.id)
      .filter((id): id is string => id !== null && id !== undefined)
  );
  const removedIds = new Set(
    changes
      .filter(c => c.action === 'rules.remove')
      .map(c => c.id)
      .filter((id): id is string => id !== null && id !== undefined)
  );
  const modifiedIds = new Set(
    changes
      .filter(c => c.action === 'rules.update' || c.action === 'rules.priority')
      .map(c => c.id)
      .filter((id): id is string => id !== null && id !== undefined)
  );

  const result: AnnotatedRule[] = [];

  for (const rule of draftRules) {
    if (addedIds.has(rule.id)) {
      result.push({ rule, status: 'added' });
    } else if (modifiedIds.has(rule.id)) {
      result.push({ rule, status: 'modified' });
    } else {
      result.push({ rule, status: 'live' });
    }
  }

  for (const rule of activeRules) {
    if (removedIds.has(rule.id)) {
      result.push({ rule, status: 'removed' });
    }
  }

  return result;
}

export function formatRulesTable(annotated: AnnotatedRule[]): string {
  const lines: string[] = [];

  const gap = 3;
  const prefixWidth = 2;
  const numWidth = Math.max('#'.length, String(annotated.length).length);
  const nameWidth = Math.max(
    'Name'.length,
    ...annotated.map(a => a.rule.name.length)
  );
  const actionTexts = annotated.map(a => formatActionDisplay(a.rule.action));
  const actionWidth = Math.max(
    'Action'.length,
    ...actionTexts.map(t => t.length)
  );
  // Header — Action before Status
  lines.push(
    `  ${' '.repeat(prefixWidth)}${chalk.dim('#'.padEnd(numWidth + gap))}${chalk.dim('Name'.padEnd(nameWidth + gap))}${chalk.dim('Action'.padEnd(actionWidth + gap))}${chalk.dim('Status')}`
  );

  for (let i = 0; i < annotated.length; i++) {
    const { rule, status } = annotated[i];
    const num = String(i + 1).padEnd(numWidth + gap);
    const name = rule.name.padEnd(nameWidth + gap);
    const actionText = actionTexts[i].padEnd(actionWidth + gap);
    let prefix = '  ';
    let colorFn: (s: string) => string = (s: string) => s;

    if (status === 'added') {
      prefix = '+ ';
      colorFn = chalk.green;
    } else if (status === 'removed') {
      prefix = '- ';
      colorFn = chalk.red;
    } else if (status === 'modified') {
      prefix = '~ ';
      colorFn = chalk.yellow;
    }

    // For removed rules, dim the status; otherwise color it normally
    const activeStatusText = rule.active ? 'Enabled' : 'Disabled';
    const activeStatus =
      status === 'removed'
        ? chalk.dim(activeStatusText)
        : rule.active
          ? chalk.green(activeStatusText)
          : chalk.red(activeStatusText);

    // Line 1: #, Name, Action, Status
    lines.push(colorFn(`  ${prefix}${num}${name}${actionText}${activeStatus}`));
    // Line 2: ID (dimmed, indented under Name column, inherits status color)
    const idIndent = ' '.repeat(prefixWidth + numWidth + gap);
    lines.push(colorFn(`  ${idIndent}${chalk.dim(rule.id)}`));
  }

  return lines.join('\n');
}

// --- Rules expanded view ---

export function formatConditionGroup(
  group: FirewallConditionGroup,
  groupIndex: number,
  totalGroups: number
): string {
  const lines: string[] = [];
  const label =
    totalGroups > 1 ? `Group ${groupIndex + 1} (AND):` : 'Conditions:';
  lines.push(`     ${chalk.dim(label)}`);

  for (const condition of group.conditions) {
    lines.push(`       ${formatConditionCompact(condition)}`);
  }

  return lines.join('\n');
}

export function formatRuleExpanded(rule: FirewallRule, index?: number): string {
  const lines: string[] = [];

  const prefix = index !== undefined ? `${index + 1}. ` : '';
  const status = rule.active ? chalk.green('Enabled') : chalk.red('Disabled');
  const action = formatActionDisplay(rule.action);

  lines.push(`  ${prefix}${chalk.bold(rule.name)} [${status}]`);

  if (rule.description) {
    lines.push(`     ${chalk.dim(rule.description)}`);
  }

  lines.push('');

  if (rule.conditionGroup.length === 0) {
    lines.push(`     ${chalk.dim('No conditions')}`);
  } else {
    for (let i = 0; i < rule.conditionGroup.length; i++) {
      lines.push(
        formatConditionGroup(
          rule.conditionGroup[i],
          i,
          rule.conditionGroup.length
        )
      );
      if (i < rule.conditionGroup.length - 1) {
        lines.push(`     ${chalk.dim('OR')}`);
      }
    }
  }

  // Action
  lines.push('');
  lines.push(`     ${chalk.dim('Action:')} ${action}`);

  // Duration (not shown for rate_limit — shown as part of "If exceeded" instead)
  const duration = rule.action.mitigate?.actionDuration;
  if (duration && rule.action.mitigate?.action !== 'rate_limit') {
    lines.push(`     ${chalk.dim('Duration:')} ${duration}`);
  }

  // Rate limit details
  const rl = rule.action.mitigate?.rateLimit;
  if (rl) {
    lines.push(
      `     ${chalk.dim('Rate Limit:')} ${rl.limit} req / ${rl.window}s (${rl.algo})`
    );
    lines.push(`     ${chalk.dim('Keys:')} ${rl.keys.join(', ')}`);
    if (rl.action) {
      const exceeded = duration ? `${rl.action} (${duration})` : rl.action;
      lines.push(`     ${chalk.dim('If exceeded:')} ${exceeded}`);
    }
  }

  // Redirect details
  const rd = rule.action.mitigate?.redirect;
  if (rd) {
    lines.push(
      `     ${chalk.dim('Redirect:')} ${rd.location} (${rd.permanent ? '301 permanent' : '307 temporary'})`
    );
  }

  return lines.join('\n');
}

/**
 * Format a single rule for inspect view (includes ID).
 */
export function formatRuleDetail(rule: FirewallRule): string {
  const lines: string[] = [];

  // Identity
  lines.push(`  ${chalk.bold('Rule:')}        ${rule.name}`);
  lines.push(`  ${chalk.bold('ID:')}          ${chalk.dim(rule.id)}`);
  lines.push(
    `  ${chalk.bold('Status:')}      ${rule.active ? chalk.green('Enabled') : chalk.red('Disabled')}`
  );
  if (rule.description) {
    lines.push(`  ${chalk.bold('Description:')} ${rule.description}`);
  }

  lines.push('');

  // Conditions (the "IF")
  if (rule.conditionGroup.length === 0) {
    lines.push(`  ${chalk.bold('Conditions:')}  ${chalk.dim('No conditions')}`);
  } else {
    lines.push(`  ${chalk.bold('Conditions:')}`);
    for (let i = 0; i < rule.conditionGroup.length; i++) {
      if (rule.conditionGroup.length > 1) {
        lines.push(`    ${chalk.dim(`Group ${i + 1} (AND):`)}`);
      }
      for (const condition of rule.conditionGroup[i].conditions) {
        lines.push(`      ${formatConditionCompact(condition)}`);
      }
      if (i < rule.conditionGroup.length - 1) {
        lines.push(`    ${chalk.dim('OR')}`);
      }
    }
  }

  lines.push('');

  // Action (the "THEN")
  lines.push(
    `  ${chalk.bold('Action:')}      ${formatActionDisplay(rule.action)}`
  );

  // Duration (not shown for rate_limit — shown as part of "If exceeded" instead)
  const duration = rule.action.mitigate?.actionDuration;
  if (duration && rule.action.mitigate?.action !== 'rate_limit') {
    lines.push(`  ${chalk.bold('Duration:')}    ${duration}`);
  }

  // Rate limit details
  const rl = rule.action.mitigate?.rateLimit;
  if (rl) {
    lines.push(`  ${chalk.bold('Rate Limit:')}`);
    lines.push(`    Algorithm:    ${rl.algo}`);
    lines.push(`    Window:       ${rl.window}s`);
    lines.push(`    Limit:        ${rl.limit} requests`);
    lines.push(`    Keys:         ${rl.keys.join(', ')}`);
    if (rl.action) {
      const exceeded = duration ? `${rl.action} (${duration})` : rl.action;
      lines.push(`    If exceeded:  ${exceeded}`);
    }
  }

  // Redirect details
  const rd = rule.action.mitigate?.redirect;
  if (rd) {
    lines.push(`  ${chalk.bold('Redirect:')}`);
    lines.push(`    Location:   ${rd.location}`);
    lines.push(
      `    Type:       ${rd.permanent ? '301 (permanent)' : '307 (temporary)'}`
    );
  }

  return lines.join('\n');
}

/** Plan entitlements that affect how firewall status is reported. */
export interface FirewallPlanInfo {
  isEnterprise?: boolean;
  hasSecurityPlus?: boolean;
}

function hasOwaspEntitlement(planInfo?: FirewallPlanInfo): boolean {
  return Boolean(planInfo?.hasSecurityPlus || planInfo?.isEnterprise);
}

/** Bot Protection lives under either legacy `bot_filter` or `bot_protection`. */
export function getBotProtectionConfig(
  managedRules?: ManagedRulesResponse | null
): ManagedRuleConfig | undefined {
  return managedRules?.bot_filter ?? managedRules?.bot_protection;
}

export function formatBotProtectionStatus(
  ruleset: ManagedRuleConfig | undefined
): string {
  if (!ruleset?.active) {
    return chalk.dim('Off');
  }
  if (ruleset.action === 'log') {
    return ACTION_COLORS.log('Log');
  }
  if (ruleset.action === 'deny') {
    return ACTION_COLORS.deny('Deny');
  }
  // Challenge is what enabling Bot Protection sets, so it also stands in for
  // a ruleset the API returned without an action.
  return ACTION_COLORS.challenge('Challenge');
}

export function formatAiBotsStatus(
  ruleset: ManagedRuleConfig | undefined
): string {
  if (!ruleset?.active) {
    return chalk.dim('Allow');
  }
  if (ruleset.action === 'log') {
    return ACTION_COLORS.log('Log');
  }
  if (ruleset.action === 'challenge') {
    return ACTION_COLORS.challenge('Challenge');
  }
  return ACTION_COLORS.deny('Deny');
}

export function formatOwaspStatus(
  ruleset: ManagedRuleConfig | undefined,
  planInfo?: FirewallPlanInfo
): string {
  if (!ruleset?.active) {
    if (!hasOwaspEntitlement(planInfo)) {
      return `${chalk.dim('Off')}  ${chalk.dim('\u00b7 requires Security+')}`;
    }
    return chalk.dim('Off');
  }
  const groups = ruleset.ruleGroups
    ? Object.values(ruleset.ruleGroups)
    : undefined;
  if (groups && groups.length > 0) {
    const activeGroups = groups.filter(g => g.active).length;
    return chalk.green(`On (${activeGroups} of ${groups.length} groups)`);
  }
  return chalk.green('On');
}

/**
 * OWASP status for `--json`. A ruleset that is off and unavailable on the plan
 * reports the upgrade needed, so an agent can tell "disabled" from "not
 * purchasable here".
 */
export function owaspJsonStatus(
  ruleset: ManagedRuleConfig | undefined,
  planInfo?: FirewallPlanInfo
): {
  enabled: boolean;
  action: string | null;
  requiresUpgrade?: boolean;
  upgrade?: 'security-plus';
} {
  const enabled = Boolean(ruleset?.active);
  const action = enabled ? (ruleset?.action ?? null) : null;
  if (enabled || hasOwaspEntitlement(planInfo)) {
    return { enabled, action };
  }
  return {
    enabled: false,
    action: null,
    requiresUpgrade: true,
    upgrade: 'security-plus',
  };
}

/**
 * The stages a request passes through, named as the dashboard's firewall
 * pipeline diagram names them so the two can be read against each other.
 */
export type FirewallStageId =
  | 'system-rules'
  | 'attack-mode'
  | 'ip-blocking'
  | 'custom-rules'
  | 'bot-management'
  | 'managed-rulesets'
  | 'deployment-routing'
  | 'response-returned';

/**
 * The dashboard groups consecutive stages and states its bypass rules per
 * group. `attack-mode` sits between two groups and belongs to neither.
 */
export type FirewallStageGroup =
  | 'system-rules'
  | 'custom-rules'
  | 'managed-rulesets'
  | 'routing';

/**
 * The two ways a request skips stages: a system bypass entry matching its IP,
 * or a custom firewall rule whose action is `bypass`.
 */
export type FirewallBypassKind = 'system' | 'custom';

export type FirewallStageState =
  /** Configured and running. */
  | 'active'
  /** Runs, but nothing is configured or it is switched off. */
  | 'inactive'
  /** A stage of several rulesets, some on and some off. */
  | 'partial'
  /** The plan cannot read this stage's configuration. */
  | 'unknown'
  /** Not configurable; the request has left the firewall. */
  | 'terminal';

export interface FirewallRulesetState {
  id: string;
  label: string;
  state: 'active' | 'inactive' | 'unavailable';
  action?: string | null;
  /** Present when `state` is `unavailable`, saying what would enable it. */
  unavailable?: { reason: 'plan'; upgrade: 'security-plus' };
}

/**
 * One stage of the pipeline.
 *
 * The first six fields are static topology: identical for every project, and
 * safe to treat as schema. `state` and below are this project's configuration.
 * Keep the split — an earlier revision hardcoded `skippedBy`, which made a
 * stage report that a bypass *could* skip it as though one *did*.
 */
export interface FirewallPipelineStage {
  // Static topology.
  id: FirewallStageId;
  order: number;
  group: FirewallStageGroup | null;
  label: string;
  description: string;
  /** Whether the project can change this stage at all. */
  configurable: boolean;
  /** Bypass kinds that are able to skip this stage. */
  skippableBy: FirewallBypassKind[];

  // Live state.
  state: FirewallStageState;
  /** Entries configured, where the stage is a collection. */
  count?: number;
  /** Mitigation action, where the stage has one. */
  action?: string | null;
  /** Members of a stage that runs several rulesets. */
  rulesets?: FirewallRulesetState[];
  /** Bypass kinds that skip this stage *given the current configuration*. */
  skippedBy?: FirewallBypassKind[];
}

export interface FirewallBypassState {
  /** `unknown` when the plan cannot read the bypass list. */
  state: 'active' | 'inactive' | 'unknown';
  /** Absent when `state` is `unknown`; absence is not zero. */
  count?: number;
  /** Stages this kind of bypass skips. */
  skips: FirewallStageId[];
}

export interface FirewallPipeline {
  bypasses: Record<FirewallBypassKind, FirewallBypassState>;
  /**
   * The stages a request passes through, in the order it passes through them.
   * Ends with the routing stages, so "nothing blocked it" is a reported
   * outcome rather than the end of the array.
   */
  requestFlow: FirewallPipelineStage[];
}

/** Static topology, in execution order. Copy for the wording lives in the dashboard diagram. */
const PIPELINE_TOPOLOGY: Omit<
  FirewallPipelineStage,
  'state' | 'count' | 'action' | 'rulesets' | 'skippedBy'
>[] = [
  {
    id: 'system-rules',
    order: 1,
    group: 'system-rules',
    label: 'System Rules',
    description:
      'Vercel-managed protections covering multiple threat categories',
    configurable: false,
    skippableBy: ['system'],
  },
  {
    id: 'attack-mode',
    order: 2,
    group: null,
    label: 'Attack Challenge Mode',
    description:
      'Challenges all visitors with a verification page when enabled',
    configurable: true,
    skippableBy: [],
  },
  {
    id: 'ip-blocking',
    order: 3,
    group: 'custom-rules',
    label: 'IP Blocking',
    description: 'User-configured IP and CIDR block rules',
    configurable: true,
    skippableBy: [],
  },
  {
    id: 'custom-rules',
    order: 4,
    group: 'custom-rules',
    label: 'Custom Firewall Rules',
    description: 'User-configured firewall rules',
    configurable: true,
    skippableBy: [],
  },
  {
    id: 'bot-management',
    order: 5,
    group: 'managed-rulesets',
    label: 'Bot Management',
    description: 'Automated bot detection and verification',
    configurable: true,
    skippableBy: ['system', 'custom'],
  },
  {
    id: 'managed-rulesets',
    order: 6,
    group: 'managed-rulesets',
    label: 'Managed Rulesets',
    description: 'OWASP Top 10 and other curated security rulesets',
    configurable: true,
    skippableBy: ['custom'],
  },
  {
    id: 'deployment-routing',
    order: 7,
    group: 'routing',
    label: 'Deployment Routing',
    description:
      'The request is routed to the deployment and the response is generated',
    configurable: false,
    skippableBy: [],
  },
  {
    id: 'response-returned',
    order: 8,
    group: 'routing',
    label: 'Response Returned',
    description: 'If no rules blocked the request, the response is returned',
    configurable: false,
    skippableBy: [],
  },
];

/** Bot Protection is its own stage, so it is not one of the managed rulesets. */
const BOT_PROTECTION_KEYS = new Set(['bot_filter', 'bot_protection']);

const RULESET_LABELS: Record<string, string> = {
  owasp: 'OWASP',
  ai_bots: 'AI Bots',
  traffic_sources: 'Traffic Sources',
  vercel_ruleset: 'Vercel Ruleset',
};

/**
 * Rulesets the stage always reports, present in the config or not. A project
 * that has never touched OWASP has no `owasp` key, but the ruleset still
 * exists and can still be plan-gated, so omitting it would report a different
 * pipeline for an untouched project than for one explicitly switched off.
 */
const ALWAYS_REPORTED_RULESETS = ['owasp', 'ai_bots'] as const;

/** `ai_bots` -> `ai-bots`, so ruleset ids read like stage ids. */
function rulesetId(key: string): string {
  return key.replace(/_/g, '-');
}

function rulesetLabel(key: string): string {
  return (
    RULESET_LABELS[key] ??
    key
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

/** Active rules whose action is `bypass`; these skip all later stages. */
function countCustomBypassRules(active: FirewallConfigResponse | null): number {
  return (
    active?.rules.filter(
      r => r.active && r.action.mitigate?.action === 'bypass'
    ).length ?? 0
  );
}

function getManagedRulesetStates(
  managedRules: ManagedRulesResponse | undefined,
  planInfo: FirewallPlanInfo | undefined
): FirewallRulesetState[] {
  const keys = [
    ...ALWAYS_REPORTED_RULESETS,
    ...Object.keys(managedRules ?? {}).filter(
      key =>
        !BOT_PROTECTION_KEYS.has(key) &&
        !ALWAYS_REPORTED_RULESETS.includes(
          key as (typeof ALWAYS_REPORTED_RULESETS)[number]
        )
    ),
  ];

  return keys
    .map(key => [key, managedRules?.[key]] as const)
    .map(([key, value]) => {
      const id = rulesetId(key);
      const label = rulesetLabel(key);

      // OWASP is the one ruleset a plan can withhold, so "off" and "not
      // purchasable here" have to stay distinguishable.
      if (key === 'owasp') {
        const owasp = owaspJsonStatus(value, planInfo);
        if (owasp.requiresUpgrade) {
          return {
            id,
            label,
            state: 'unavailable' as const,
            unavailable: { reason: 'plan' as const, upgrade: owasp.upgrade! },
          };
        }
        return {
          id,
          label,
          state: owasp.enabled ? ('active' as const) : ('inactive' as const),
          action: owasp.action,
        };
      }

      return {
        id,
        label,
        state: value?.active ? ('active' as const) : ('inactive' as const),
        action: value?.active ? (value.action ?? null) : null,
      };
    });
}

function getManagedRulesetsState(
  rulesets: FirewallRulesetState[]
): FirewallStageState {
  const configurable = rulesets.filter(r => r.state !== 'unavailable');
  const active = configurable.filter(r => r.state === 'active').length;
  if (active === 0) return 'inactive';
  return active === configurable.length ? 'active' : 'partial';
}

/**
 * The firewall pipeline as the dashboard diagram models it: ordered stages,
 * the groups they belong to, and the two kinds of bypass that skip them.
 *
 * Reports the same model the human summary implies, in a form an agent can act
 * on without parsing rows. Shared by `firewall status` and `firewall overview`
 * so the two cannot disagree about execution order.
 */
export function getFirewallPipeline(opts: {
  active: FirewallConfigResponse | null;
  /** Bypass rules, or `null` when the bypass API is gated on the plan. */
  bypass: BypassRule[] | null;
  attackMode?: AttackModeStatus;
  planInfo?: FirewallPlanInfo;
  firewallBypassIps?: string[];
}): FirewallPipeline {
  const { active, bypass, attackMode, planInfo, firewallBypassIps } = opts;

  // An all-sources bypass represents paused mitigations rather than a bypass
  // entry, and is reported through the `system-rules` stage instead.
  const systemBypassIps = bypass?.filter(b => !isAllSourcesBypass(b.Ip)) ?? [];
  const customBypassRules = countCustomBypassRules(active);

  const bypasses: Record<FirewallBypassKind, FirewallBypassState> = {
    system:
      bypass === null
        ? { state: 'unknown', skips: [] }
        : {
            state: systemBypassIps.length > 0 ? 'active' : 'inactive',
            count: systemBypassIps.length,
            skips: [],
          },
    custom: {
      state: customBypassRules > 0 ? 'active' : 'inactive',
      count: customBypassRules,
      skips: [],
    },
  };

  // Derived from the topology rather than restated, so the two directions of
  // the same edge cannot drift apart.
  for (const kind of ['system', 'custom'] as const) {
    bypasses[kind].skips = PIPELINE_TOPOLOGY.filter(s =>
      s.skippableBy.includes(kind)
    ).map(s => s.id);
  }

  const mitigationsPaused = getMitigationsStatus(
    firewallBypassIps,
    bypass
  ).paused;
  const botProtection = getBotProtectionConfig(active?.managedRules);
  const managedRulesets = getManagedRulesetStates(
    active?.managedRules,
    planInfo
  );
  const activeRules = active?.rules.filter(r => r.active).length ?? 0;
  const ipBlocks = active?.ips.length ?? 0;

  const requestFlow = PIPELINE_TOPOLOGY.map(
    (topology): FirewallPipelineStage => {
      // Only a bypass that is actually configured skips anything.
      const skippedBy = topology.skippableBy.filter(
        kind => bypasses[kind].state === 'active'
      );
      const base = { ...topology, skippedBy };

      switch (topology.id) {
        case 'system-rules':
          return { ...base, state: mitigationsPaused ? 'inactive' : 'active' };
        case 'attack-mode':
          return {
            ...base,
            state: attackMode?.enabled ? 'active' : 'inactive',
          };
        case 'ip-blocking':
          return {
            ...base,
            state: ipBlocks > 0 ? 'active' : 'inactive',
            count: ipBlocks,
          };
        case 'custom-rules':
          return {
            ...base,
            state:
              active?.firewallEnabled && activeRules > 0
                ? 'active'
                : 'inactive',
            count: activeRules,
          };
        case 'bot-management':
          return {
            ...base,
            state: botProtection?.active ? 'active' : 'inactive',
            action: botProtection?.action ?? null,
          };
        case 'managed-rulesets':
          return {
            ...base,
            state: getManagedRulesetsState(managedRulesets),
            count: managedRulesets.filter(r => r.state === 'active').length,
            rulesets: managedRulesets,
          };
        default:
          return { ...base, state: 'terminal' };
      }
    }
  );

  return { bypasses, requestFlow };
}
