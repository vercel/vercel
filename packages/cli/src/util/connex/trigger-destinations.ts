import chalk from 'chalk';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { ConnexTriggerDestination } from '../../commands/connex/types';

export const MAX_TRIGGER_DESTINATIONS = 3;

export function destinationsMatch(
  a: ConnexTriggerDestination,
  b: ConnexTriggerDestination
): boolean {
  return (
    a.projectId === b.projectId &&
    (a.branch ?? null) === (b.branch ?? null) &&
    (a.path ?? null) === (b.path ?? null)
  );
}

export function findMatchingDestination(
  destinations: readonly ConnexTriggerDestination[],
  desired: ConnexTriggerDestination
): ConnexTriggerDestination | undefined {
  return destinations.find(d => destinationsMatch(d, desired));
}

export function buildTriggerDestination(input: {
  projectId: string;
  branch?: string;
  path?: string;
}): ConnexTriggerDestination {
  const dest: ConnexTriggerDestination = { projectId: input.projectId };
  if (input.branch !== undefined) {
    dest.branch = input.branch;
  }
  if (input.path !== undefined) {
    dest.path = input.path;
  }
  return dest;
}

export function formatDestination(d: ConnexTriggerDestination): string {
  return [
    `project ${chalk.bold(d.projectId)}`,
    `branch ${chalk.bold(d.branch ?? 'production')}`,
    `path ${chalk.bold(d.path ?? '<default>')}`,
  ].join(', ');
}

function toJsonDestination(d: ConnexTriggerDestination): JSONObject {
  const entry: JSONObject = { projectId: d.projectId };
  if (d.branch !== undefined) {
    entry.branch = d.branch;
  }
  if (d.path !== undefined) {
    entry.path = d.path;
  }
  return entry;
}

/**
 * Replaces the full trigger-destinations list on a connector. The PATCH
 * endpoint is replace-not-append, so callers compute the desired final list
 * (existing + additions) before calling.
 */
export async function patchTriggerDestinations(
  client: Client,
  connectorId: string,
  destinations: readonly ConnexTriggerDestination[]
): Promise<void> {
  const body = destinations.map(toJsonDestination);
  await client.fetch<unknown>(
    `/v1/connect/connectors/${encodeURIComponent(connectorId)}/trigger-destinations`,
    {
      method: 'PATCH',
      body: { destinations: body },
    }
  );
}
