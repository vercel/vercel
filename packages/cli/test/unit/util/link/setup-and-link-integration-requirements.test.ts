import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { setupRequiredIntegrations } from '../../../../src/util/link/setup-and-link';
import readConfig from '../../../../src/util/config/read-config';
import { parseIntegrationRequirements } from '../../../../src/util/integration/requirements';
import { add as addIntegration } from '../../../../src/commands/integration/add';

vi.mock('../../../../src/util/config/read-config', () => ({
  default: vi.fn(),
}));

vi.mock('../../../../src/util/integration/requirements', () => ({
  parseIntegrationRequirements: vi.fn(),
}));

vi.mock('../../../../src/commands/integration/add', () => ({
  add: vi.fn(),
}));

describe('setupRequiredIntegrations()', () => {
  const readConfigMock = vi.mocked(readConfig);
  const parseRequirementsMock = vi.mocked(parseIntegrationRequirements);
  const addIntegrationMock = vi.mocked(addIntegration);

  beforeEach(() => {
    client.reset();
    vi.clearAllMocks();
  });

  it('installs each slug when autoConfirm is true', async () => {
    readConfigMock.mockResolvedValue({
      integrations: ['neon', 'supabase'],
    });
    parseRequirementsMock.mockReturnValue({
      slugs: ['neon', 'supabase'],
      errors: [],
    });
    addIntegrationMock.mockResolvedValue(0);

    await setupRequiredIntegrations(client, {
      cwd: client.cwd,
      autoConfirm: true,
      nonInteractive: false,
    });

    expect(addIntegrationMock).toHaveBeenCalledTimes(2);
    expect(addIntegrationMock).toHaveBeenCalledWith(
      client,
      ['neon'],
      { '--no-env-pull': true },
      'integration add'
    );
    expect(addIntegrationMock).toHaveBeenCalledWith(
      client,
      ['supabase'],
      { '--no-env-pull': true },
      'integration add'
    );
  });

  it('installs without prompting in non-interactive mode', async () => {
    readConfigMock.mockResolvedValue({
      integrations: ['neon'],
    });
    parseRequirementsMock.mockReturnValue({
      slugs: ['neon'],
      errors: [],
    });
    addIntegrationMock.mockResolvedValue(0);

    await setupRequiredIntegrations(client, {
      cwd: client.cwd,
      autoConfirm: false,
      nonInteractive: true,
    });

    expect(addIntegrationMock).toHaveBeenCalledWith(
      client,
      ['neon'],
      { '--no-env-pull': true },
      'integration add'
    );
  });

  it('skips when no slugs are found', async () => {
    readConfigMock.mockResolvedValue({});
    parseRequirementsMock.mockReturnValue({
      slugs: [],
      errors: [],
    });

    await setupRequiredIntegrations(client, {
      cwd: client.cwd,
      autoConfirm: true,
      nonInteractive: false,
    });

    expect(addIntegrationMock).not.toHaveBeenCalled();
  });

  it('warns on failed integration install and continues', async () => {
    readConfigMock.mockResolvedValue({
      integrations: ['neon', 'supabase'],
    });
    parseRequirementsMock.mockReturnValue({
      slugs: ['neon', 'supabase'],
      errors: [],
    });
    addIntegrationMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await setupRequiredIntegrations(client, {
      cwd: client.cwd,
      autoConfirm: true,
      nonInteractive: false,
    });

    expect(addIntegrationMock).toHaveBeenCalledTimes(2);
  });
});
