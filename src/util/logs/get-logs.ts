import { URLSearchParams } from 'url';
import Client from '../client';
import { Event } from '../../types';

interface Options {
  since?: number;
  limit?: number;
  types?: string[];
  deploymentId: string;
}

export default async function getLogs(client: Client, options: Options) {
  const deploymentId = encodeURIComponent(options.deploymentId);
  const types = ['stdout', 'stderr', ...(options.types || [])];

  const query = new URLSearchParams({
    types: types.join(','),
    follow: '0',
    direction: 'forward',
    limit: (options.limit ? options.limit.toString() : '100'),
    ...(options.since ? { since: options.since.toString() } : {})
  });

  const events = await client.fetch<Event[]>(`/v2/now/deployments/${deploymentId}/events?${query}`);

  return events;
}
