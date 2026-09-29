import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertBuiltCli, withScenario } from './harness/run-cli';
import { registerUserRoutes } from '../mocks/user-team-routes';

// Portable whoami behavior lives in `portable/cases/whoami.scenarios.ts`.
// These cases depend on the Node preload guard or test the harness itself.
const token = 'scenario_token';
const user = {
  id: 'user_scenario',
  email: 'scenario@example.test',
  name: 'Scenario User',
  username: 'scenario-user',
};

beforeAll(() => {
  assertBuiltCli();
});

describe('vc whoami subprocess scenarios (TS-only)', () => {
  it('records the Git fallback when the workspace has no repo link', async () => {
    await withScenario(async ({ api, sandbox, run }) => {
      registerUserRoutes(api.router, user);
      rmSync(join(sandbox.workspace, '.vercel', 'repo.json'));

      const result = await run({ args: ['whoami'], token });

      expect(result.guardViolations).toContainEqual({
        kind: 'child_process',
        target: 'execSync git rev-parse --show-toplevel',
      });
    });
  });

  it('fails visibly when a required route is missing', async () => {
    await withScenario(async ({ api, run }) => {
      const result = await run({ args: ['whoami'], token });

      expect(result.exitCode).toBe(1);
      expect(result.guardViolations).toEqual([]);
      expect(
        api.unhandled.map(({ method, path }) => `${method} ${path}`)
      ).toEqual(['GET /v2/user']);
    });
  });
});
