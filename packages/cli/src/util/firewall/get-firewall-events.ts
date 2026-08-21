import type Client from '../client';
import type { FirewallEventsResponse } from './types';

/**
 * Public rows do not include a rule id. Tinybird pipe
 * `firewall_actions_by_project_v2` selects `internal_ref_id` and `rule` in
 * intermediate nodes, then drops both from the final SELECT. Inspect
 * attributes a custom rule via observability instead (same join as the
 * dashboard blocked-IP banner). Returning those columns here would make
 * attribution exact.
 */

export interface GetFirewallEventsOptions {
  projectId: string;
  teamId: string;
  startTime: Date;
  endTime: Date;
}

export async function getFirewallEvents(
  client: Client,
  opts: GetFirewallEventsOptions
): Promise<FirewallEventsResponse> {
  const query = new URLSearchParams();
  query.set('projectId', opts.projectId);
  query.set('teamId', opts.teamId);
  query.set('startTimestamp', String(opts.startTime.getTime()));
  query.set('endTimestamp', String(opts.endTime.getTime()));

  return client.fetch<FirewallEventsResponse>(
    `/v1/security/firewall/events?${query.toString()}`
  );
}
