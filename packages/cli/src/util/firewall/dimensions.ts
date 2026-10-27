/**
 * The traffic dimensions of `vercel.firewall_action.count`, the metric behind
 * the dashboard's firewall traffic page — plus the request-count dimension
 * bot management still reads from `vercel.request.count` (`unknown-bot`).
 *
 * Field names are the Observability API's camelCase dimensions (see
 * `vercel metrics schema vercel.firewall_action.count`). They are not the
 * names the firewall events API returns — a row's hostname is `host` there
 * and `requestHostname` here — and a filter naming the wrong one is rejected
 * outright. So this table is the one place the CLI spells them.
 */
export interface TrafficDimension {
  /** CLI-facing name: the `traffic inspect` argument and the filter flag. */
  alias: string;
  /** camelCase dimension on the metric. */
  field: string;
  /** Singular human label, e.g. "IP Address". */
  label: string;
  /** Heading for this dimension's top list, e.g. "Top IPs". */
  widgetTitle: string;
  /**
   * Rows a top list of this dimension should not spend time scanning,
   * mirroring the dashboard's per-widget exclusions. A row carrying no value
   * for the dimension can never be an answer, and loopback traffic alone
   * would crowd the real clients out of Top IPs.
   */
  excludeFilter?: string;
  /**
   * Query `vercel.request.count` instead of `vercel.firewall_action.count`.
   * Unknown-bot categories are request-count dimensions; a query moved onto
   * this metric must not carry a filter naming `wafRuleId` or `wafAction`.
   *
   * Spelled here rather than imported from `observability-query`: this
   * table is loaded by the query helpers, and importing them back is a
   * cycle.
   */
  metric?: string;
  /**
   * Always AND-ed into this dimension's query, on top of `excludeFilter`.
   */
  extraFilter?: string;
  /**
   * Observability `groupBy` for this dimension's top list. Defaults to
   * `[field]`. AS names include `asnId` so two networks that share a name
   * do not collapse into one row.
   */
  groupBy?: string[];
  /**
   * Extra group-by fields to append to the printed label, so two ASNs that
   * share a name stay distinguishable. `value` stays `field` for inspect.
   */
  labelFields?: string[];
  /** Further dimensions worth naming in this dimension's inspect header. */
  headerDetailFields?: string[];
  /** Breakdown dimension when `traffic inspect` is given no --group-by. */
  defaultGroupBy: string;
}

/**
 * Double quotes so a value cannot be read as syntax: quoting neutralizes the
 * wildcards, spaces and operators KQL would otherwise interpret, and only a
 * backslash and a quote need escaping inside them. Mirrors how `@vercel/kql`
 * serializes a quoted literal.
 */
function quoteKqlValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function eqFilter(field: string, value: string): string {
  return `${field}:${quoteKqlValue(value)}`;
}

export function neFilter(field: string, value: string): string {
  return `${field}!=${quoteKqlValue(value)}`;
}

/**
 * Rows carrying a value for the dimension. `field:*` is KQL's existence test
 * and compiles to `IS NOT NULL`, which no warehouse column here is: an absent
 * dimension is stored as the empty string, so that is what has to be excluded.
 */
export function nonEmptyFilter(field: string): string {
  return neFilter(field, '');
}

export const TRAFFIC_DIMENSIONS: TrafficDimension[] = [
  {
    alias: 'ip',
    field: 'clientIp',
    label: 'IP Address',
    widgetTitle: 'Top IPs',
    excludeFilter: neFilter('clientIp', '127.0.0.1'),
    headerDetailFields: ['asnName', 'asnId', 'clientIpCountry'],
    defaultGroupBy: 'path',
  },
  {
    alias: 'ja4',
    field: 'clientJa4Digest',
    label: 'JA4 Digest',
    widgetTitle: 'Top JA4 Digests',
    excludeFilter: nonEmptyFilter('clientJa4Digest'),
    headerDetailFields: ['clientUserAgent'],
    defaultGroupBy: 'path',
  },
  {
    alias: 'asn',
    field: 'asnName',
    label: 'AS Name',
    widgetTitle: 'Top AS Names',
    excludeFilter: `(${nonEmptyFilter('asnId')}) AND (${nonEmptyFilter('asnName')})`,
    groupBy: ['asnName', 'asnId'],
    labelFields: ['asnId'],
    headerDetailFields: ['asnId'],
    defaultGroupBy: 'ip',
  },
  {
    alias: 'user-agent',
    field: 'clientUserAgent',
    label: 'User Agent',
    widgetTitle: 'Top User Agents',
    excludeFilter: nonEmptyFilter('clientUserAgent'),
    defaultGroupBy: 'path',
  },
  {
    alias: 'path',
    field: 'requestPath',
    label: 'Request Path',
    widgetTitle: 'Top Request Paths',
    excludeFilter: nonEmptyFilter('requestPath'),
    defaultGroupBy: 'ip',
  },
  {
    alias: 'rule',
    field: 'wafRuleId',
    label: 'Firewall Rule',
    widgetTitle: 'Rules',
    // Rows naming neither a rule nor an action carry no attribution, and left
    // in they crowd out the rules a top list is asked for.
    excludeFilter: `(${nonEmptyFilter('wafRuleId')}) AND (${nonEmptyFilter('wafAction')})`,
    defaultGroupBy: 'ip',
  },
  {
    alias: 'host',
    field: 'requestHostname',
    label: 'Hostname',
    widgetTitle: 'Top Hosts',
    defaultGroupBy: 'path',
  },
  {
    // Named bots on the firewall metric. A non-empty `botName` is how that
    // event records a verified bot (`botName` aliases `verifiedBot`);
    // `botVerified` is a request-count dimension and would leave the free
    // firewall path.
    alias: 'bot',
    field: 'botName',
    label: 'Bot',
    widgetTitle: 'Verified Bots',
    excludeFilter: nonEmptyFilter('botName'),
    defaultGroupBy: 'path',
  },
  {
    // The dashboard's bot-management card, not the traffic page. Request
    // counts, inverted: everything that did not pass verification, grouped
    // by the category BotID assigned.
    alias: 'unknown-bot',
    field: 'botCategory',
    label: 'Unknown Bot Category',
    widgetTitle: 'Unknown Bot Traffic',
    excludeFilter: nonEmptyFilter('botCategory'),
    metric: 'vercel.request.count',
    extraFilter: neFilter('botVerified', 'pass'),
    defaultGroupBy: 'path',
  },
  {
    alias: 'country',
    field: 'clientIpCountry',
    label: 'Country',
    widgetTitle: 'Top Countries',
    excludeFilter: nonEmptyFilter('clientIpCountry'),
    defaultGroupBy: 'ip',
  },
  {
    alias: 'action',
    field: 'wafAction',
    label: 'Firewall Action',
    widgetTitle: 'Actions',
    excludeFilter: nonEmptyFilter('wafAction'),
    defaultGroupBy: 'rule',
  },
];

export function getDimension(alias: string): TrafficDimension | undefined {
  return TRAFFIC_DIMENSIONS.find(d => d.alias === alias);
}

export function dimensionAliases(): string[] {
  return TRAFFIC_DIMENSIONS.map(d => d.alias);
}

/**
 * AND-combine KQL filters, parenthesized the way `vercel metrics` does.
 * Undefined and empty parts drop out, so a caller can pass optional filters
 * without checking each one first.
 *
 * `AND` is uppercase because KQL reads a lowercase `and` as a search term.
 */
export function andFilters(
  ...parts: Array<string | undefined>
): string | undefined {
  const nonEmpty = parts.filter((p): p is string => Boolean(p && p.length > 0));
  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];
  return nonEmpty.map(p => `(${p})`).join(' AND ');
}
