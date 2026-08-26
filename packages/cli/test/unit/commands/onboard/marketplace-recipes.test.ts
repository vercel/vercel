import { describe, expect, it } from 'vitest';
import {
  buildRecipes,
  formatRecipes,
  inferCapabilities,
} from '../../../../src/commands/onboard/marketplace-recipes';
import type { MigrationSignal } from '../../../../src/commands/onboard/migration-signals';

const CATALOG = [
  { slug: 'neon', name: 'Neon', description: 'Serverless Postgres' },
  { slug: 'supabase', name: 'Supabase', description: 'Postgres platform' },
  { slug: 'upstash', name: 'Upstash', description: 'Serverless Redis' },
  { slug: 'upstash-kafka', name: 'Upstash Kafka' },
  { slug: 'acme-blob', name: 'Acme Object Storage' },
  { slug: 'unrelated', name: 'Error Tracker', description: 'APM' },
];

function signal(
  kind: MigrationSignal['kind'],
  evidence: string,
  source = 'docker-compose.yml'
): MigrationSignal {
  return { kind, evidence, source, confidence: 'high' };
}

describe('marketplace recipes', () => {
  describe('inferCapabilities', () => {
    it('maps runtime sqlite to a postgres need, citing the signal', () => {
      const needs = inferCapabilities([
        signal('sqlite-runtime', 'Runtime SQLite usage: `...`', 'server/db.js'),
      ]);
      expect(needs).toEqual([
        {
          capability: 'postgres',
          because: ['Runtime SQLite usage: `...` (server/db.js)'],
        },
      ]);
    });

    it('maps database volumes by engine, sessions and queues to redis, shared volumes to blob', () => {
      const needs = inferCapabilities([
        signal(
          'database-volume',
          'Database service `db` (postgres:16) persists to a volume'
        ),
        signal(
          'memory-session-store',
          'Depends on `express-session` with no external session-store package',
          'package.json'
        ),
        signal(
          'resident-worker',
          'Depends on `bullmq` (queue consumers are resident processes)',
          'package.json'
        ),
        signal(
          'shared-volume',
          'Named volume `artifacts` mounted by `web` and `worker`'
        ),
      ]);
      const capabilities = needs.map(need => need.capability).sort();
      expect(capabilities).toEqual(['blob', 'postgres', 'redis']);
      const redis = needs.find(need => need.capability === 'redis');
      expect(redis?.because).toHaveLength(2);
    });

    it('does not invent needs from unrelated signals', () => {
      expect(
        inferCapabilities([
          signal(
            'reverse-proxy-route',
            'Route `/api/` proxies to `http://api:8000`',
            'nginx.conf'
          ),
          signal('websocket', 'Depends on `socket.io`', 'package.json'),
          signal(
            'resident-worker',
            'Process `worker` runs `node worker.js`',
            'Procfile'
          ),
        ])
      ).toEqual([]);
    });
  });

  describe('buildRecipes', () => {
    it('filters the catalog per capability and binds the pinned team', () => {
      const recipes = buildRecipes({
        needs: [{ capability: 'postgres', because: ['x'] }],
        catalog: CATALOG,
        team: 'acme-team',
      });
      expect(recipes).toHaveLength(1);
      expect(recipes[0].entries.map(entry => entry.slug)).toEqual([
        'neon',
        'supabase',
      ]);
      expect(recipes[0].entries[0].suggestedCommand).toBe(
        'vercel integration add neon --name <resource-name> --scope acme-team'
      );
    });

    it('omits --scope when no team is pinned, and never invents providers', () => {
      const recipes = buildRecipes({
        needs: [
          { capability: 'redis', because: ['x'] },
          { capability: 'mongodb', because: ['y'] },
        ],
        catalog: CATALOG,
      });
      const redis = recipes.find(recipe => recipe.capability === 'redis');
      // `upstash` qualifies through its "Serverless Redis" description;
      // `upstash-kafka` must not ride along on the company name.
      expect(redis?.entries.map(entry => entry.slug)).toEqual(['upstash']);
      expect(redis?.entries[0].suggestedCommand).toBe(
        'vercel integration add upstash --name <resource-name>'
      );
      // Nothing in the catalog serves mongodb: empty, not invented.
      const mongo = recipes.find(recipe => recipe.capability === 'mongodb');
      expect(mongo?.entries).toEqual([]);
    });

    it('contains no secrets and no silent plan selection', () => {
      const recipes = buildRecipes({
        needs: [{ capability: 'postgres', because: ['x'] }],
        catalog: CATALOG,
        team: 'acme-team',
      });
      const commands = recipes.flatMap(recipe =>
        recipe.entries.map(entry => entry.suggestedCommand)
      );
      for (const command of commands) {
        expect(command).not.toMatch(/--plan/);
        expect(command).not.toMatch(/token|secret|key=/i);
      }
    });
  });

  describe('formatRecipes', () => {
    it('renders needs with citations and exact commands', () => {
      const rendered = formatRecipes(
        buildRecipes({
          needs: [
            {
              capability: 'postgres',
              because: ['Runtime SQLite usage: `...` (server/db.js)'],
            },
          ],
          catalog: CATALOG,
          team: 'acme-team',
        })
      );
      expect(rendered).toContain('Need: postgres');
      expect(rendered).toContain('Runtime SQLite usage');
      expect(rendered).toContain(
        'vercel integration add neon --name <resource-name> --scope acme-team'
      );
      expect(rendered).toContain('Never choose a paid plan');
    });

    it('renders an unmatched need with the browse fallback, never dropping it', () => {
      expect(formatRecipes([])).toBeUndefined();
      const rendered = formatRecipes(
        buildRecipes({
          needs: [{ capability: 'mongodb', because: ['db volume (compose)'] }],
          catalog: CATALOG,
        })
      );
      // The need is real information even without a catalog match.
      expect(rendered).toContain('Need: mongodb');
      expect(rendered).toContain('No pre-matched integration');
      expect(rendered).toContain('vercel integration');
    });
  });
});
