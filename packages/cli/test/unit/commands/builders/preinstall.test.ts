import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { client } from '../../../mocks/client';
import builders from '../../../../src/commands/builders';
import { help as rootHelp } from '../../../../src/help';
import { getRootHelpCommands } from '../../../../src/commands/root-help';
import { commands, commandsStructs } from '../../../../src/commands';
import { SUBCOMMANDS_WITHOUT_TOKEN } from '../../../../src/util/subcommands-without-token';

const mocks = vi.hoisted(() => {
  const importBuilders = vi.fn(
    async (specs: Map<string, string>) =>
      new Map([...specs.keys()].map(spec => [spec, { builder: {} }]))
  );
  return {
    createVltBuilderImporter: vi.fn(() => importBuilders),
    importBuilders,
    loadEmbeddedBuilderGraphs: vi.fn(),
  };
});

vi.mock('../../../../src/builders/vlt-builder-graph', () => ({
  loadEmbeddedBuilderGraphs: mocks.loadEmbeddedBuilderGraphs,
}));

vi.mock('../../../../src/builders/vlt-builder-importer', () => ({
  createVltBuilderImporter: mocks.createVltBuilderImporter,
}));

const graphs = {
  schemaVersion: 1 as const,
  builders: {
    '@vercel/next': {},
    '@vercel/node': {},
  },
};

describe('builders preinstall', () => {
  afterEach(() => {
    delete process.env.VERCEL_VC_NATIVE;
    delete process.env.VERCEL_CLI_MANAGED_BUILDERS;
    delete process.env.VERCEL_BUILDERS_DIR;
    mocks.createVltBuilderImporter.mockClear();
    mocks.importBuilders.mockClear();
    mocks.loadEmbeddedBuilderGraphs.mockReset();
  });

  it('materializes every embedded Builder graph into the configured cache', async () => {
    const cacheRoot = join(process.cwd(), 'builders-cache');
    process.env.VERCEL_VC_NATIVE = '1';
    process.env.VERCEL_BUILDERS_DIR = cacheRoot;
    mocks.loadEmbeddedBuilderGraphs.mockResolvedValue(graphs);
    client.setArgv('builders', 'preinstall');

    await expect(builders(client)).resolves.toBe(0);

    expect(mocks.createVltBuilderImporter).toHaveBeenCalledWith(
      expect.objectContaining({ cacheRoot, graphs })
    );
    expect(mocks.importBuilders).toHaveBeenCalledWith(
      new Map([
        ['@vercel/next', '@vercel/next'],
        ['@vercel/node', '@vercel/node'],
      ])
    );
    expect(client.stderr.getFullOutput()).toContain(
      `Preinstalled 2 Builders in ${cacheRoot}`
    );
  });

  it.each([
    ['--debug', 'builders', 'preinstall'],
    ['builders', 'preinstall', '--debug'],
    ['--cwd', '/tmp', 'builders', 'preinstall'],
  ])('accepts global flags: %j', async (...argv) => {
    const cacheRoot = join(process.cwd(), 'builders-cache');
    process.env.VERCEL_VC_NATIVE = '1';
    process.env.VERCEL_BUILDERS_DIR = cacheRoot;
    mocks.loadEmbeddedBuilderGraphs.mockResolvedValue(graphs);
    client.setArgv(...argv);

    await expect(builders(client)).resolves.toBe(0);
    expect(mocks.importBuilders).toHaveBeenCalledTimes(1);
  });

  it('fails when an embedded Builder cannot be loaded', async () => {
    const cacheRoot = join(process.cwd(), 'builders-cache');
    process.env.VERCEL_VC_NATIVE = '1';
    process.env.VERCEL_BUILDERS_DIR = cacheRoot;
    mocks.loadEmbeddedBuilderGraphs.mockResolvedValue(graphs);
    mocks.importBuilders.mockResolvedValueOnce(
      new Map([['@vercel/next', { builder: {} }]])
    );
    client.setArgv('builders', 'preinstall');

    await expect(builders(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Failed to load preinstalled Builders: @vercel/node'
    );
  });

  it('preinstalls with VERCEL_CLI_MANAGED_BUILDERS outside the native CLI', async () => {
    const cacheRoot = join(process.cwd(), 'builders-cache');
    process.env.VERCEL_CLI_MANAGED_BUILDERS = '1';
    process.env.VERCEL_BUILDERS_DIR = cacheRoot;
    mocks.loadEmbeddedBuilderGraphs.mockResolvedValue(graphs);
    client.setArgv('builders', 'preinstall');

    await expect(builders(client)).resolves.toBe(0);
    expect(mocks.createVltBuilderImporter).toHaveBeenCalledWith(
      expect.objectContaining({ cacheRoot, graphs })
    );
  });

  it('requires the native CLI or VERCEL_CLI_MANAGED_BUILDERS', async () => {
    process.env.VERCEL_BUILDERS_DIR = '/opt/vercel/builders';
    client.setArgv('builders', 'preinstall');

    await expect(builders(client)).resolves.toBe(1);
    expect(mocks.loadEmbeddedBuilderGraphs).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'Builder preinstallation requires the native Vercel CLI or VERCEL_CLI_MANAGED_BUILDERS=1.'
    );
  });

  it('requires an absolute VERCEL_BUILDERS_DIR', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    process.env.VERCEL_BUILDERS_DIR = 'builders-cache';
    client.setArgv('builders', 'preinstall');

    await expect(builders(client)).resolves.toBe(1);
    expect(mocks.loadEmbeddedBuilderGraphs).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'VERCEL_BUILDERS_DIR must be an absolute path.'
    );
  });

  it('requires VERCEL_BUILDERS_DIR', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    client.setArgv('builders', 'preinstall');

    await expect(builders(client)).resolves.toBe(1);
    expect(mocks.loadEmbeddedBuilderGraphs).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'Set VERCEL_BUILDERS_DIR to preinstall Builders.'
    );
  });

  it('does not require authentication', () => {
    expect(SUBCOMMANDS_WITHOUT_TOKEN).toContain('builders');
  });

  it('is registered without appearing in root help', () => {
    expect(commands.get('builders')).toBe('builders');
    expect(rootHelp(getRootHelpCommands(commandsStructs))).not.toMatch(
      /^\s+builders\s/m
    );
  });
});
