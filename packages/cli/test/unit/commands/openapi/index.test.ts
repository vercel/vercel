import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import openapi from '../../../../src/commands/openapi';

const __dirname = dirname(fileURLToPath(import.meta.url));
const minimalOpenApiPath = join(
  __dirname,
  '../../../fixtures/unit/openapi/minimal-openapi.json'
);
const minimalOpenApiJson = readFileSync(minimalOpenApiPath, 'utf-8');

describe('openapi', () => {
  beforeEach(() => {
    const originalFetch = client.fetch.bind(client);
    vi.spyOn(client, 'fetch').mockImplementation(async (url, opts) => {
      if (url === 'https://openapi.vercel.sh/') {
        return {
          ok: true,
          status: 200,
          text: async () => minimalOpenApiJson,
        } as any;
      }
      return originalFetch(url, opts);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('--help', () => {
    it('prints help message', async () => {
      client.setArgv('openapi', '--help');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain('Same behavior as `vercel api`');
    });
  });

  describe('arguments', () => {
    it('lists all opted-in operations when no tag (same as `openapi ls`)', async () => {
      client.setArgv('openapi', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first ');
    });

    it('treats missing operationId as tag describe', async () => {
      client.setArgv('openapi', 'test-tag', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first ');
    });
  });

  describe('--describe', () => {
    it('describes opted-in operations under a tag when operationId is omitted', async () => {
      client.setArgv('openapi', 'test-tag', '--describe', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first ');
      expect(out).toContain('First operation');
      expect(out).toContain('test-op-two');
      expect(out).toContain('Creates another resource.');
      expect(out).not.toContain('hidden-op');
      expect(out).not.toContain('GET');
      expect(out).not.toContain('/v1/test');
    });

    it('matches tags case-insensitively', async () => {
      client.setArgv('openapi', 'TEST-TAG', '--describe', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toContain('test-tag');
    });

    it('matches tags across kebab, snake, and camel', async () => {
      client.setArgv('openapi', 'test_tag', '--describe', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first ');
    });

    it('matches camelCase input to kebab-case tag', async () => {
      client.setArgv('openapi', 'testTag', '--describe', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toContain('test-op-two');
    });

    it('prints kebab id and description for one operation', async () => {
      client.setArgv(
        'openapi',
        'test-tag',
        'testOp',
        '--describe',
        '--refresh'
      );
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first');
      expect(out).toContain('First operation');
      expect(out).not.toContain('GET');
      expect(out).not.toContain('/v1/test');
    });

    it('accepts x-vercel-cli alias as the operation argument', async () => {
      client.setArgv('openapi', 'test-tag', 'first', '--describe', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('first');
      expect(out).toContain('First operation');
    });
  });

  describe('ls', () => {
    it('lists opted-in operations grouped by tag', async () => {
      client.setArgv('openapi', 'ls', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first ');
      expect(out).not.toContain('hidden-op');
    });

    it('matches bare openapi, list, --describe, and ls for global output', async () => {
      const outputs: string[] = [];
      for (const argv of [
        ['openapi', '--refresh'],
        ['openapi', 'list', '--refresh'],
        ['openapi', '--describe', '--refresh'],
        ['openapi', 'ls', '--refresh'],
      ] as const) {
        client.reset();
        client.setArgv(...argv);
        await openapi(client);
        outputs.push(client.stdout.getFullOutput());
      }
      expect(outputs[0]).toBe(outputs[1]);
      expect(outputs[1]).toBe(outputs[2]);
      expect(outputs[2]).toBe(outputs[3]);
    });

    it('lists opted-in operations for one tag', async () => {
      client.setArgv('openapi', 'ls', 'test-tag', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('test-op-two');
    });
  });

  describe('path and query parameters', () => {
    it('substitutes path placeholders and query options for the HTTP request', async () => {
      let filter: string | undefined;
      client.scenario.get('/v1/projects/:projectId/things', (req, res) => {
        filter = req.query.filter as string | undefined;
        res.json({ ok: true });
      });
      client.setArgv(
        'openapi',
        'test-tag',
        'projectThing',
        'p1',
        '--filter=hello',
        '--refresh'
      );
      const exitCode = await openapi(client);
      expect(exitCode).toBe(0);
      expect(filter).toBe('hello');
      expect(client.stdout.getFullOutput()).toContain('"ok": true');
    });
  });

  describe('wrong tag', () => {
    it('suggests valid tags when operationId exists', async () => {
      client.setArgv(
        'openapi',
        'wrong-tag',
        'testOp',
        '--describe',
        '--refresh'
      );
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain('test-tag');
    });
  });
});
