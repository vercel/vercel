import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vltMocks = vi.hoisted(() => {
  const importBuilders = vi.fn();
  return {
    createVltBuilderImporter: vi.fn(() => importBuilders),
    importBuilders,
    loadEmbeddedBuilderGraphs: vi.fn(),
    loadEmbeddedBuilderIndex: vi.fn(),
  };
});

vi.mock('../../../src/builders/vlt-builder-graph', () => ({
  loadEmbeddedBuilderGraphs: vltMocks.loadEmbeddedBuilderGraphs,
  loadEmbeddedBuilderIndex: vltMocks.loadEmbeddedBuilderIndex,
}));

vi.mock('../../../src/builders/vlt-builder-importer', () => ({
  createVltBuilderImporter: vltMocks.createVltBuilderImporter,
}));

async function loadImportBuilders() {
  return import('../../../src/builders/import-builders');
}

describe('preloadVltBuilderImports()', () => {
  const vltBuilder = { pkg: { name: '@vercel/node' } };

  beforeEach(() => {
    vi.resetModules();
    process.env.VERCEL_VC_NATIVE = '1';
    vltMocks.createVltBuilderImporter.mockClear();
    vltMocks.importBuilders
      .mockReset()
      .mockResolvedValue(new Map([['@vercel/node', vltBuilder]]));
    vltMocks.loadEmbeddedBuilderIndex.mockReset();
    vltMocks.loadEmbeddedBuilderGraphs.mockReset();
  });

  afterEach(() => {
    delete process.env.VERCEL_VC_NATIVE;
  });

  function createSpan() {
    const attributes: Record<string, string | undefined> = {};
    return {
      attributes,
      setAttributes(attrs: Record<string, string | undefined>) {
        Object.assign(attributes, attrs);
      },
    };
  }

  it('lets a build reuse the in-flight preload', async () => {
    let resolveGraphs!: (graphs: unknown) => void;
    vltMocks.loadEmbeddedBuilderIndex.mockReturnValue(
      new Promise(resolve => {
        resolveGraphs = resolve;
      })
    );
    const { importBuilders, preloadVltBuilderImports } =
      await loadImportBuilders();

    const preload = preloadVltBuilderImports();
    const span = createSpan();
    const builders = importBuilders(
      new Set(['@vercel/node']),
      process.cwd(),
      span as never
    );
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(vltMocks.createVltBuilderImporter).not.toHaveBeenCalled();
    expect(preloadVltBuilderImports()).toBe(preload);

    resolveGraphs({ builders: {} });
    await preload;
    expect((await builders).get('@vercel/node')).toBe(vltBuilder);
    expect(vltMocks.loadEmbeddedBuilderIndex).toHaveBeenCalledTimes(1);
    // The full graphs are only for installing a missing Builder.
    expect(vltMocks.loadEmbeddedBuilderGraphs).not.toHaveBeenCalled();
    expect(span.attributes['builders.vlt.preloadState']).toBe('inFlight');
    expect(
      Number(span.attributes['builders.vlt.preloadAwaitMs'])
    ).toBeGreaterThanOrEqual(5);
  });

  it('does not load again after the preload finished', async () => {
    vltMocks.loadEmbeddedBuilderIndex.mockResolvedValue({ builders: {} });
    const { getVltPreloadState, importBuilders, preloadVltBuilderImports } =
      await loadImportBuilders();

    expect(getVltPreloadState()).toBe('notStarted');
    await preloadVltBuilderImports();
    expect(getVltPreloadState()).toBe('done');
    const span = createSpan();
    await importBuilders(
      new Set(['@vercel/node']),
      process.cwd(),
      span as never
    );
    await importBuilders(new Set(['@vercel/node']), process.cwd());

    expect(vltMocks.loadEmbeddedBuilderIndex).toHaveBeenCalledTimes(1);
    expect(span.attributes['builders.vlt.preloadState']).toBe('done');
  });

  it('reports a build that loads vlt without a preload', async () => {
    vltMocks.loadEmbeddedBuilderIndex.mockResolvedValue({ builders: {} });
    const { importBuilders } = await loadImportBuilders();
    const span = createSpan();
    await importBuilders(
      new Set(['@vercel/node']),
      process.cwd(),
      span as never
    );
    expect(span.attributes['builders.vlt.preloadState']).toBe('notStarted');
    expect(span.attributes['builders.vlt.preloadAwaitMs']).toEqual(
      expect.any(String)
    );
  });

  it('loads on demand after a failed preload', async () => {
    vltMocks.loadEmbeddedBuilderIndex
      .mockRejectedValueOnce(new Error('graph unavailable'))
      .mockResolvedValue({ builders: {} });
    const { importBuilders, preloadVltBuilderImports } =
      await loadImportBuilders();

    await expect(preloadVltBuilderImports()).rejects.toThrow(
      'graph unavailable'
    );
    const span = createSpan();
    const builders = await importBuilders(
      new Set(['@vercel/node']),
      process.cwd(),
      span as never
    );

    expect(builders.get('@vercel/node')).toBe(vltBuilder);
    expect(span.attributes['builders.vlt.preloadState']).toBe('failed');
    expect(vltMocks.loadEmbeddedBuilderIndex).toHaveBeenCalledTimes(2);
  });
});
