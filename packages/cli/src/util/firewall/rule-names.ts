import type { FirewallConfigResponse, FirewallIpRule } from './types';

/**
 * Display names for system, managed, and OWASP rule ids, matching the
 * dashboard's `getRuleName` map in `front` (`components/firewall/lib/config.ts`).
 */
const WELL_KNOWN_RULE_NAMES: Record<string, string> = {
  sys_dos_mitigation: 'DDoS Mitigation',
  ip_blocking: 'IP Blocking',
  challenge_mode: 'Attack Mode',
  default_web_traffic: 'Allowed Requests',
  managed_bot_protection: 'Bot Protection',
  managed_bot_filter: 'Bot Protection',
  owasp_anomaly_detection: 'OWASP Anomaly Detection',
  owasp_xss_detection: 'OWASP XSS Detection',
  owasp_sqli_detection: 'OWASP SQL Injection Detection',
  owasp_rfi_detection: 'OWASP RFI Detection',
  owasp_lfi_detection: 'OWASP LFI Detection',
  owasp_rce_detection: 'OWASP RCE Detection',
  owasp_php_detection: 'OWASP PHP Injection Detection',
  owasp_session_fixation_detection: 'OWASP Session Fixation Detection',
  deployment_rules: 'Deployment Rules',
  deployment_defined_rules: 'Deployment Defined Rules',
};

function titleCaseManagedSuffix(ruleId: string): string {
  return ruleId
    .slice('managed_'.length)
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ipBlockName(ip: FirewallIpRule): string {
  if (!ip.hostname || ip.hostname === '*') {
    return `IP Block ${ip.ip}`;
  }
  return `IP Block ${ip.hostname} ${ip.ip}`;
}

/**
 * Resolve a `waf_rule_id` to the dashboard-style display name using the
 * already-fetched active firewall config. Unknown ids fall back to themselves.
 */
export function resolveRuleDisplayName(
  ruleId: string,
  config?: FirewallConfigResponse | null
): string {
  if (!ruleId) return ruleId;

  const custom = config?.rules.find(r => r.id === ruleId);
  if (custom?.name) return custom.name;

  const ip = config?.ips.find(r => r.id === ruleId);
  if (ip) return ipBlockName(ip);

  const known = WELL_KNOWN_RULE_NAMES[ruleId];
  if (known) return known;

  if (ruleId.startsWith('managed_')) {
    return titleCaseManagedSuffix(ruleId);
  }

  return ruleId;
}
