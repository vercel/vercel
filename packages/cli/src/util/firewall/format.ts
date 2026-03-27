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
    `  ${chalk.bold('System Mitigations:')}  ${formatMitigationsStatus(bypass)}`
  );

  if (draft && draft.changes.length > 0) {
    lines.push('');
    lines.push(
      `  ${chalk.bold('Pending Draft:')}        ${chalk.yellow(`${draft.changes.length} unpublished change${draft.changes.length !== 1 ? 's' : ''}`)}`
    );
    lines.push(formatDiffOutput(draft.changes));
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

export function formatChangeDescription(change: FirewallConfigChange): string {
  const { action, id, value } = change;

  switch (action) {
    case 'rules.insert': {
      const rule = value as { name?: string } | undefined;
      return `Added rule "${rule?.name || id || 'unknown'}"`;
    }
    case 'rules.update': {
      const rule = value as { name?: string } | undefined;
      return `Modified rule "${rule?.name || id || 'unknown'}"`;
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

export function formatDiffOutput(changes: FirewallConfigChange[]): string {
  const lines: string[] = [];

  for (const change of changes) {
    const { symbol, color } = getDiffSymbol(change.action);
    const description = formatChangeDescription(change);
    lines.push(color(`  ${symbol} ${description}`));
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
  const type = condition.key
    ? `${condition.type}[${condition.key}]`
    : condition.type;
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
  const statusWidth = Math.max(
    'Status'.length,
    ...annotated.map(a => (a.rule.active ? 'Active' : 'Inactive').length)
  );
  const actionTexts = annotated.map(a => formatActionDisplay(a.rule.action));
  const actionWidth = Math.max(
    'Action'.length,
    ...actionTexts.map(t => t.length)
  );

  // Header
  lines.push(
    `  ${' '.repeat(prefixWidth)}${chalk.dim('#'.padEnd(numWidth + gap))}${chalk.dim('Name'.padEnd(nameWidth + gap))}${chalk.dim('Status'.padEnd(statusWidth + gap))}${chalk.dim('Action'.padEnd(actionWidth + gap))}${chalk.dim('Description')}`
  );

  for (let i = 0; i < annotated.length; i++) {
    const { rule, status } = annotated[i];
    const num = String(i + 1).padEnd(numWidth + gap);
    const name = rule.name.padEnd(nameWidth + gap);
    const activeStatus = (rule.active ? 'Active' : 'Inactive').padEnd(
      statusWidth + gap
    );
    const actionText = actionTexts[i].padEnd(actionWidth + gap);
    const description = rule.description || '';

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

    lines.push(
      colorFn(
        `  ${prefix}${num}${name}${activeStatus}${actionText}${description}`
      )
    );
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
  const status = rule.active ? 'Active' : chalk.dim('Inactive');
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

  // Duration
  const duration = rule.action.mitigate?.actionDuration;
  if (duration) {
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
      lines.push(`     ${chalk.dim('Sub-action:')} ${rl.action}`);
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

  lines.push(`  ${chalk.bold('Rule:')}        ${rule.name}`);
  lines.push(`  ${chalk.bold('ID:')}          ${chalk.dim(rule.id)}`);
  lines.push(
    `  ${chalk.bold('Status:')}      ${rule.active ? chalk.green('Active') : chalk.dim('Inactive')}`
  );
  lines.push(
    `  ${chalk.bold('Action:')}      ${formatActionDisplay(rule.action)}`
  );
  if (rule.description) {
    lines.push(`  ${chalk.bold('Description:')} ${rule.description}`);
  }

  // Duration
  const duration = rule.action.mitigate?.actionDuration;
  if (duration) {
    lines.push(`  ${chalk.bold('Duration:')}    ${duration}`);
  }

  lines.push('');

  // Conditions
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

  // Rate limit details
  const rl = rule.action.mitigate?.rateLimit;
  if (rl) {
    lines.push('');
    lines.push(`  ${chalk.bold('Rate Limit:')}`);
    lines.push(`    Algorithm:  ${rl.algo}`);
    lines.push(`    Window:     ${rl.window}s`);
    lines.push(`    Limit:      ${rl.limit} requests`);
    lines.push(`    Keys:       ${rl.keys.join(', ')}`);
    if (rl.action) {
      lines.push(`    Sub-action: ${rl.action}`);
    }
  }

  // Redirect details
  const rd = rule.action.mitigate?.redirect;
  if (rd) {
    lines.push('');
    lines.push(`  ${chalk.bold('Redirect:')}`);
    lines.push(`    Location:   ${rd.location}`);
    lines.push(
      `    Type:       ${rd.permanent ? '301 (permanent)' : '307 (temporary)'}`
    );
  }

  return lines.join('\n');
}
