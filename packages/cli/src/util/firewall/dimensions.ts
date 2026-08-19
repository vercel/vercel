/**
 * Traffic dimensions on the firewall observability metrics
 * (`vercel.firewall_action.count` / `vercel.request.count`). Field names are
 * the public schema's snake_case dimensions (see
 * `GET /v2/observability/schema/vercel.firewall_action.count`); they mirror
 * the dashboard's camelCase Sonar fields (clientIp, clientJa4Digest, ...).
 */
export interface TrafficDimension {
  /** CLI-facing name used as positional arg and filter flag. */
  alias: string;
  /** snake_case dimension on the observability metric. */
  field: string;
  /** Singular human label ("IP Address"). */
  label: string;
  /** Widget title on the traffic dashboard ("Top IPs"). */
  widgetTitle: string;
  /**
   * OData filter excluding empty/noise values, mirroring the dashboard's
   * per-widget exclusions (e.g. loopback traffic dominates raw Top IPs).
   */
  excludeFilter?: string;
  /** Dimensions fetched for a drill-in header's distinct detail line. */
  headerDetailFields?: string[];
  /** Default drill-in breakdown group-by (another dimension alias). */
  defaultGroupBy: string;
}

export const TRAFFIC_DIMENSIONS: TrafficDimension[] = [
  {
    alias: 'ip',
    field: 'client_ip',
    label: 'IP Address',
    widgetTitle: 'Top IPs',
    excludeFilter: "client_ip ne '127.0.0.1'",
    headerDetailFields: ['asn_name', 'asn_id', 'client_ip_country'],
    defaultGroupBy: 'path',
  },
  {
    alias: 'ja4',
    field: 'client_ja4_digest',
    label: 'JA4 Digest',
    widgetTitle: 'Top JA4 Digests',
    excludeFilter: "client_ja4_digest ne ''",
    headerDetailFields: ['client_user_agent'],
    defaultGroupBy: 'path',
  },
  {
    alias: 'asn',
    field: 'asn_name',
    label: 'AS Name',
    widgetTitle: 'Top AS Names',
    excludeFilter: "(asn_id ne '') and (asn_name ne '')",
    headerDetailFields: ['asn_id'],
    defaultGroupBy: 'ip',
  },
  {
    alias: 'user-agent',
    field: 'client_user_agent',
    label: 'User Agent',
    widgetTitle: 'Top User Agents',
    excludeFilter: "client_user_agent ne ''",
    defaultGroupBy: 'path',
  },
  {
    alias: 'path',
    field: 'request_path',
    label: 'Request Path',
    widgetTitle: 'Top Request Paths',
    excludeFilter: "request_path ne ''",
    defaultGroupBy: 'ip',
  },
  {
    alias: 'rule',
    field: 'waf_rule_id',
    label: 'Firewall Rule',
    widgetTitle: 'Rules',
    excludeFilter: "(waf_rule_id ne '') and (waf_action ne '')",
    defaultGroupBy: 'ip',
  },
  {
    alias: 'host',
    field: 'request_hostname',
    label: 'Hostname',
    widgetTitle: 'Top Hosts',
    defaultGroupBy: 'path',
  },
  {
    alias: 'bot',
    field: 'bot_name',
    label: 'Bot',
    widgetTitle: 'Top Bots',
    excludeFilter: "bot_name ne ''",
    defaultGroupBy: 'path',
  },
  {
    alias: 'country',
    field: 'client_ip_country',
    label: 'Country',
    widgetTitle: 'Top Countries',
    excludeFilter: "client_ip_country ne ''",
    defaultGroupBy: 'ip',
  },
  {
    alias: 'action',
    field: 'waf_action',
    label: 'Firewall Action',
    widgetTitle: 'Actions',
    excludeFilter: "waf_action ne ''",
    defaultGroupBy: 'rule',
  },
];

export function getDimension(alias: string): TrafficDimension | undefined {
  return TRAFFIC_DIMENSIONS.find(d => d.alias === alias);
}

export function dimensionAliases(): string[] {
  return TRAFFIC_DIMENSIONS.map(d => d.alias);
}

/** Single quotes escape by doubling in OData string literals. */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function eqFilter(field: string, value: string): string {
  return `${field} eq '${escapeODataString(value)}'`;
}

/** AND-combine OData filters, parenthesized like `vercel metrics` does. */
export function andFilters(
  ...parts: Array<string | undefined>
): string | undefined {
  const nonEmpty = parts.filter((p): p is string => Boolean(p && p.length > 0));
  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];
  return nonEmpty.map(p => `(${p})`).join(' and ');
}
