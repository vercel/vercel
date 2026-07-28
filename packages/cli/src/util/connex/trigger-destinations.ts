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
    (a.customEnvironmentId ?? null) === (b.customEnvironmentId ?? null) &&
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
  customEnvironmentId?: string;
  branch?: string;
  path?: string;
}): ConnexTriggerDestination {
  if (input.branch !== undefined && input.customEnvironmentId !== undefined) {
    throw new Error(
      'Trigger destinations cannot target both a branch and a custom environment.'
    );
  }

  const dest: ConnexTriggerDestination = { projectId: input.projectId };
  if (input.customEnvironmentId !== undefined) {
    dest.customEnvironmentId = input.customEnvironmentId;
  }
  if (input.branch !== undefined) {
    dest.branch = input.branch;
  }
  if (input.path !== undefined) {
    dest.path = input.path;
  }
  return dest;
}

export function formatDestination(d: ConnexTriggerDestination): string {
  const target = d.customEnvironmentId
    ? `custom environment ${chalk.bold(d.customEnvironmentId)}`
    : `branch ${chalk.bold(d.branch ?? 'production')}`;

  return [
    `project ${chalk.bold(d.projectId)}`,
    target,
    `path ${chalk.bold(d.path ?? '<default>')}`,
  ].join(', ');
}

function toJsonDestination(d: ConnexTriggerDestination): JSONObject {
  const entry: JSONObject = { projectId: d.projectId };
  if (d.customEnvironmentId !== undefined) {
    entry.customEnvironmentId = d.customEnvironmentId;
  }
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
