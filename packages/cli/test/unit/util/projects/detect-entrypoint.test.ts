import { describe, it, expect, vi, beforeEach } from 'vitest';

const detectPython = vi.fn();
const detectNode = vi.fn();
const detectGo = vi.fn();
const importBuilders = vi.fn();

vi.mock('../../../../src/util/build/import-builders', () => ({
  importBuilders,
}));

const { createDetectEntrypoint } = await import(
  '../../../../src/util/projects/detect-entrypoint'
);

function mockBuilder(name: string, detectEntrypoint: ReturnType<typeof vi.fn>) {
  return new Map([
    [
      name,
      {
        builder: { detectEntrypoint },
        pkg: { name },
        path: `/abs/builders/${name}`,
        pkgPath: `/abs/builders/${name}/package.json`,
        dynamicallyInstalled: true,
      },
    ],
  ]);
}

describe('createDetectEntrypoint', () => {
  beforeEach(() => {
    detectPython.mockReset();
    detectNode.mockReset();
    detectGo.mockReset();
    importBuilders.mockReset();
    detectPython.mockResolvedValue({
      kind: 'py-module:attr',
      entrypoint: 'main:app',
    });
    detectNode.mockResolvedValue({ kind: 'file', entrypoint: 'index.ts' });
    detectGo.mockResolvedValue({ kind: 'file', entrypoint: 'main.go' });
  });

  it('routes Python frameworks to @vercel/python via importBuilders', async () => {
    importBuilders.mockResolvedValue(
      mockBuilder('@vercel/python', detectPython)
    );
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'services/api',
      framework: 'fastapi',
    });

    expect(importBuilders).toHaveBeenCalledWith(
      new Set(['@vercel/python']),
      '/abs/project'
    );
    expect(detectPython).toHaveBeenCalledWith({
      workPath: '/abs/project/services/api',
      framework: 'fastapi',
    });
    expect(detectNode).not.toHaveBeenCalled();
    expect(detectGo).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'py-module:attr', entrypoint: 'main:app' });
  });

  it('routes Node backend frameworks to @vercel/backends via importBuilders', async () => {
    importBuilders.mockResolvedValue(
      mockBuilder('@vercel/backends', detectNode)
    );
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'backend',
      framework: 'hono',
    });

    expect(importBuilders).toHaveBeenCalledWith(
      new Set(['@vercel/backends']),
      '/abs/project'
    );
    expect(detectNode).toHaveBeenCalledWith({
      workPath: '/abs/project/backend',
    });
    expect(detectPython).not.toHaveBeenCalled();
    expect(detectGo).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'file', entrypoint: 'index.ts' });
  });

  it('routes the go runtime framework to @vercel/go via importBuilders', async () => {
    importBuilders.mockResolvedValue(mockBuilder('@vercel/go', detectGo));
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'services/svc',
      framework: 'go',
    });

    expect(importBuilders).toHaveBeenCalledWith(
      new Set(['@vercel/go']),
      '/abs/project'
    );
    expect(detectGo).toHaveBeenCalledWith({
      workPath: '/abs/project/services/svc',
    });
    expect(detectPython).not.toHaveBeenCalled();
    expect(detectNode).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'file', entrypoint: 'main.go' });
  });

  it('returns null for frontend frameworks (no per-runtime detector)', async () => {
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'apps/web',
      framework: 'nextjs',
    });

    expect(importBuilders).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns null when no framework slug is supplied', async () => {
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({ workPath: 'whatever' });

    expect(importBuilders).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns null when the builder has no detectEntrypoint export', async () => {
    importBuilders.mockResolvedValue(
      new Map([
        [
          '@vercel/python',
          {
            builder: {},
            pkg: { name: '@vercel/python' },
            path: '/abs/builders/@vercel/python',
            pkgPath: '/abs/builders/@vercel/python/package.json',
            dynamicallyInstalled: true,
          },
        ],
      ])
    );
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'services/api',
      framework: 'fastapi',
    });
    expect(result).toBeNull();
  });
});
