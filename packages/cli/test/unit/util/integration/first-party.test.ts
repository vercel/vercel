import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isFirstPartyIntegration,
  provisionFirstPartyIntegration,
} from '../../../../src/util/integration/first-party';
import { client } from '../../../mocks/client';

vi.mock('../../../../src/util/projects/link', () => ({
  getLinkedProject: vi.fn(),
}));

vi.mock(
  '../../../../src/util/integration-resource/connect-resource-to-project',
  () => ({
    connectResourceToProject: vi.fn(),
  })
);

import { getLinkedProject } from '../../../../src/util/projects/link';
import { connectResourceToProject } from '../../../../src/util/integration-resource/connect-resource-to-project';

const getLinkedProjectMock = vi.mocked(getLinkedProject);
const connectResourceToProjectMock = vi.mocked(connectResourceToProject);

describe('isFirstPartyIntegration', () => {
  it('returns true for "blob"', () => {
    expect(isFirstPartyIntegration('blob')).toBe(true);
  });

  it('returns false for marketplace slugs', () => {
    expect(isFirstPartyIntegration('neon')).toBe(false);
    expect(isFirstPartyIntegration('supabase')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isFirstPartyIntegration('')).toBe(false);
  });
});

describe('provisionFirstPartyIntegration', () => {
  beforeEach(() => {
    client.reset();
    vi.clearAllMocks();
  });

  it('returns 1 for unknown slug', async () => {
    const exitCode = await provisionFirstPartyIntegration(
      client,
      'unknown-slug'
    );
    expect(exitCode).toBe(1);
  });

  describe('blob', () => {
    it('creates a blob store and connects to linked project', async () => {
      getLinkedProjectMock.mockResolvedValue({
        status: 'linked',
        org: {
          id: 'org_123',
          slug: 'my-team',
          type: 'team',
        },
        project: {
          id: 'proj_123',
          name: 'my-project',
        } as any,
      });

      client.scenario.post('/v1/storage/stores/blob', (_req, res) => {
        res.json({ store: { id: 'store_abc', region: 'iad1' } });
      });

      connectResourceToProjectMock.mockResolvedValue(undefined);

      const exitCode = await provisionFirstPartyIntegration(client, 'blob');

      expect(exitCode).toBe(0);
      expect(connectResourceToProjectMock).toHaveBeenCalledWith(
        client,
        'proj_123',
        'store_abc',
        ['production', 'preview', 'development'],
        { accountId: 'org_123' }
      );
    });

    it('creates a blob store without connecting when project is not linked', async () => {
      getLinkedProjectMock.mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });

      client.scenario.post('/v1/storage/stores/blob', (_req, res) => {
        res.json({ store: { id: 'store_def', region: 'iad1' } });
      });

      const exitCode = await provisionFirstPartyIntegration(client, 'blob');

      expect(exitCode).toBe(0);
      expect(connectResourceToProjectMock).not.toHaveBeenCalled();
    });

    it('returns 1 when blob store creation fails', async () => {
      getLinkedProjectMock.mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });

      client.scenario.post('/v1/storage/stores/blob', (_req, res) => {
        res.status(500).json({ error: { message: 'Internal Server Error' } });
      });

      const exitCode = await provisionFirstPartyIntegration(client, 'blob');

      expect(exitCode).toBe(1);
    });
  });
});
