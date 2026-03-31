import chalk from 'chalk';
import type {
  FirewallConfigResponse,
  FirewallConfigChange,
  FirewallChangeAction,
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
