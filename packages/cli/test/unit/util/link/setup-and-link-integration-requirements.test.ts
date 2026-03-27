import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { setupRequiredIntegrations } from '../../../../src/util/link/setup-and-link';
import readConfig from '../../../../src/util/config/read-config';
import {
  parseIntegrationRequirements,
  resolveIntegrationRequirements,
} from '../../../../src/util/integration/requirements';
import { add as addIntegration } from '../../../../src/commands/integration/add';

vi.mock('../../../../src/util/config/read-config', () => ({
  default: vi.fn(),
}));

vi.mock('../../../../src/util/integration/requirements', () => ({
  parseIntegrationRequirements: vi.fn(),
  resolveIntegrationRequirements: vi.fn(),
}));

vi.mock('../../../../src/commands/integration/add', () => ({
  add: vi.fn(),
}));

describe('setupRequiredIntegrations()', () => {
  const readConfigMock = vi.mocked(readConfig);
  const parseRequirementsMock = vi.mocked(parseIntegrationRequirements);
  const resolveRequirementsMock = vi.mocked(resolveIntegrationRequirements);
  const addIntegrationMock = vi.mocked(addIntegration);

  beforeEach(() => {
    client.reset();
    vi.clearAllMocks();
  });

  it('installs auto-selected requirement matches when autoConfirm is true', async () => {
    readConfigMock.mockResolvedValue({
      integrations: { storage: ['postgres'] },
    });
    parseRequirementsMock.mockReturnValue({
      requirements: [{ group: 'storage', token: 'postgres' }],
      errors: [],
    });
    resolveRequirementsMock.mockResolvedValue([
      {
        requirement: { group: 'storage', token: 'postgres' },
        candidates: [
          {
            name: 'Neon Postgres',
            slug: 'neon',
            provider: 'Neon',
            description: 'Postgres database',
            tags: ['Storage', 'postgres'],
            score: 100,
          },
        ],
      },
    ]);
    addIntegrationMock.mockResolvedValue(0);

    await setupRequiredIntegrations(client, {
      cwd: client.cwd,
      autoConfirm: true,
      nonInteractive: false,
    });

    expect(addIntegrationMock).toHaveBeenCalledWith(
      client,
      ['neon'],
      { '--no-env-pull': true },
      'integration add'
    );
  });

  it('skips ambiguous matches in non-interactive mode', async () => {
    readConfigMock.mockResolvedValue({
      integrations: { storage: ['postgres'] },
    });
    parseRequirementsMock.mockReturnValue({
      requirements: [{ group: 'storage', token: 'postgres' }],
      errors: [],
    });
    resolveRequirementsMock.mockResolvedValue([
      {
        requirement: { group: 'storage', token: 'postgres' },
        candidates: [
          {
            name: 'Neon Postgres',
            slug: 'neon',
            provider: 'Neon',
            description: 'Postgres database',
            tags: ['Storage', 'postgres'],
            score: 100,
          },
          {
            name: 'Acme DB',
            slug: 'acme-multi/acme-db',
            provider: 'Acme',
            description: 'Relational database',
            tags: ['Storage', 'postgres'],
            score: 95,
          },
        ],
      },
    ]);

    await setupRequiredIntegrations(client, {
      cwd: client.cwd,
      autoConfirm: false,
      nonInteractive: true,
    });

    expect(addIntegrationMock).not.toHaveBeenCalled();
  });
});
