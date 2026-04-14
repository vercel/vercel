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

describe('openapi', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_OPENAPI_SPEC_PATH', minimalOpenApiPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('--help', () => {
    it('prints help message', async () => {
      client.setArgv('openapi', '--help');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Call the Vercel REST API using OpenAPI tag and operationId'
      );
    });
  });

  describe('arguments', () => {
    it('requires tag when not using tag-only --describe or ls', async () => {
      client.setArgv('openapi', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain('Missing argument');
    });

    it('requires operationId unless --describe or ls', async () => {
      client.setArgv('openapi', 'test-tag', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain('Missing operationId');
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

    it('lists opted-in operations for one tag', async () => {
      client.setArgv('openapi', 'ls', 'test-tag', '--refresh');
      const exitCode = await openapi(client);
      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('test-op-two');
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
