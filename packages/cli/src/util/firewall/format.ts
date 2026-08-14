import chalk from 'chalk';
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
} from './types';

export interface AttackModeStatus {
  enabled: boolean;
  /** Epoch milliseconds */
  activeUntil?: number | null;
}

export function isAllSourcesBypass(ip: string): boolean {
  return ip === '0.0.0.0/0' || ip === '::/0';
}

export function isMitigationsPaused(bypass: BypassRule[]): boolean {
  const now = Math.floor(Date.now() / 1000);
  return bypass.some(
    b =>
      isAllSourcesBypass(b.Ip) &&
      b.Domain === '*' &&
      (b.ExpiresAt === null || b.ExpiresAt === undefined || b.ExpiresAt > now)
  );
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
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    return chalk.red(`On (expires in ${hours}h ${minutes}m)`);
  }
  return chalk.red('On');
}

export function formatMitigationsStatus(bypass: BypassRule[]): string {
  if (isMitigationsPaused(bypass)) {
    const entry = bypass.find(
      b => isAllSourcesBypass(b.Ip) && b.Domain === '*'
    );
    if (entry?.ExpiresAt) {
      const remainingMs = entry.ExpiresAt * 1000 - Date.now();
      if (remainingMs > 0) {
        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        const minutes = Math.floor(
          (remainingMs % (60 * 60 * 1000)) / (60 * 1000)
        );
        return chalk.yellow(`Paused (auto-resumes in ${hours}h ${minutes}m)`);
      }
    }
    return chalk.yellow('Paused');
  }
  return chalk.green('Active');
}

export function formatStatusOutput(
  active: FirewallConfigResponse | null,
  draft: FirewallConfigResponse | null,
  bypass: BypassRule[],
  attackMode?: AttackModeStatus
): string {
  const lines: string[] = [];

  if (active) {
    const enabled = active.firewallEnabled;
    lines.push(
      `  ${chalk.bold('Firewall:')}             ${enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`
    );

    const activeRules = active.rules.filter(r => r.active).length;
    const inactiveRules = active.rules.filter(r => !r.active).length;
    const totalRules = active.rules.length;
    lines.push(
      `  ${chalk.bold('Custom Rules:')}         ${activeRules} active, ${inactiveRules} inactive (${totalRules} total)`
    );

    lines.push(`  ${chalk.bold('IP Blocks:')}            ${active.ips.length}`);
  } else {
    lines.push(
      `  ${chalk.bold('Firewall:')}             ${chalk.dim('Not configured')}`
    );
  }

  // Filter out the allSources bypass (system mitigations) from the count
  const regularBypasses = bypass.filter(b => !isAllSourcesBypass(b.Ip));
  lines.push(
    `  ${chalk.bold('System Bypass:')}        ${regularBypasses.length} IP${regularBypasses.length !== 1 ? 's' : ''}`
  );

  lines.push('');
  if (attackMode) {
    lines.push(
      `  ${chalk.bold('Attack Mode:')}          ${formatAttackModeStatus(attackMode)}`
    );
  }
  lines.push(
    `  ${chalk.bold('System Mitigations:')}   ${formatMitigationsStatus(bypass)}`
  );

  if (draft && draft.changes.length > 0) {
    lines.push('');
    lines.push(
      `  ${chalk.bold('Pending Draft:')}        ${chalk.yellow(`${draft.changes.length} unpublished change${draft.changes.length !== 1 ? 's' : ''}`)}`
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
