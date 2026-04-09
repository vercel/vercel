import chalk from 'chalk';
import type {
  FirewallConfigResponse,
  FirewallConfigChange,
  FirewallChangeAction,
  BypassRule,
} from './types';

export function formatStatusOutput(
  active: FirewallConfigResponse | null,
  draft: FirewallConfigResponse | null,
  bypass: BypassRule[]
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

  lines.push(
    `  ${chalk.bold('System Bypass:')}        ${bypass.length} IP${bypass.length !== 1 ? 's' : ''}`
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
