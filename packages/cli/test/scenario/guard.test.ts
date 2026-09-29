import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runNodeWithGuard, withScenario } from './harness/run-cli';

const probePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'harness',
  'guard-probe.mjs'
);

describe('scenario subprocess guard', () => {
  it('denies egress and nested processes while allowing the fake API', async () => {
    await withScenario(async ({ api, sandbox }) => {
      api.router.get('/ok', (_req, res) => {
        res.send('ok');
      });

      const result = await runNodeWithGuard(probePath, [], sandbox, api, {});

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        netConnect: 'ERR_SCENARIO_GUARD',
        tlsConnect: 'ERR_SCENARIO_GUARD',
        fetch: 'ERR_SCENARIO_GUARD',
        namedSpawnSync: 'ERR_SCENARIO_GUARD',
        execSync: 'ERR_SCENARIO_GUARD',
        allowedFetch: 'ok',
      });
      expect(result.guardViolations).toEqual([
        { kind: 'socket', target: '203.0.113.1:443' },
        { kind: 'socket', target: 'example.com:443' },
        { kind: 'socket', target: 'example.com:443' },
        {
          kind: 'child_process',
          target: `spawnSync ${process.execPath}`,
        },
        { kind: 'child_process', target: 'execSync git --version' },
      ]);
      expect(api.unhandled).toEqual([]);
    });
  });
});
