import { describe, expect, it } from 'vitest';
import {
  parseIntegrationRequirements,
  resolveIntegrationRequirements,
} from '../../../../src/util/integration/requirements';
import { client } from '../../../mocks/client';
import { useIntegrationDiscover } from '../../../mocks/integration';

describe('integration requirements', () => {
  it('parses namespaced requirements from vercel.json', () => {
    const result = parseIntegrationRequirements({
      integrations: {
        storage: ['postgres', 'postgres'],
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.requirements).toEqual([
      {
        group: 'storage',
        token: 'postgres',
      },
    ]);
  });

  it('returns errors for invalid requirement shapes', () => {
    const result = parseIntegrationRequirements({
      integrations: {
        ai: 'openai' as unknown as string[],
        storage: ['postgres', ''],
      },
    });

    expect(result.errors).toContain(
      'Expected "ai" integration requirements to be an array of strings.'
    );
    expect(result.errors).toContain(
      'Expected "storage" integration requirements to contain non-empty strings.'
    );
  });

  it('resolves postgres requirement to discover candidates', async () => {
    client.reset();
    useIntegrationDiscover();

    const resolutions = await resolveIntegrationRequirements(client, [
      {
        group: 'storage',
        token: 'postgres',
      },
    ]);

    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].candidates.map(candidate => candidate.slug)).toEqual(
      expect.arrayContaining(['acme-multi/acme-db', 'neon'])
    );
  });
});
