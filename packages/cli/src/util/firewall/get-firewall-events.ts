import type Client from '../client';
import type { FirewallEventsResponse } from './types';

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
