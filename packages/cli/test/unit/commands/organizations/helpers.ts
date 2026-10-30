import { afterEach, beforeEach, expect, vi } from 'vitest';
import organizations from '../../../../src/commands/organizations';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import { client } from '../../../mocks/client';

export const org = {
  organizationId: 'org_abc123',
  slug: 'acme',
  name: 'Acme',
  teamId: 'team_root',
  teamCount: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};
export const team = {
  organizationId: org.organizationId,
  teamId: 'team_child',
  ssoMode: 'team',
  billingPlan: 'platform',
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
};

export async function run(...args: string[]) {
  client.setArgv('organizations', ...args);
  return organizations(client);
}

/**
 * Runs a command that fails in agent mode and returns the payload it wrote.
 *
 * `outputAgentError` and `outputActionRequired` end the process, as they do for
 * every other command family, so the exit is stubbed to throw instead.
 */
export async function runExpectingAgentExit(...args: string[]) {
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as () => never);
  await expect(run(...args)).rejects.toThrow('exit');
  return jsonOutput();
}

export function jsonOutput() {
  const stdout = client.stdout.getFullOutput();
  expect(stdout).not.toContain('\u001b');
  return JSON.parse(stdout);
}

export function setupOrganizationsTest() {
  beforeEach(() => {
    // The team lookup is memoized across commands, so a stale entry would let
    // one test resolve another test's organization.
    teamCache.clear();

    // CI blocks the billing consent prompt, so the result of a test must not
    // depend on the runner. A test that needs CI stubs it again.
    vi.stubEnv('CI', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
}
