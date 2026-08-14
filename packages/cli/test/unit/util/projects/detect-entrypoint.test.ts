import { describe, it, expect, vi, beforeEach } from 'vitest';

const detectPython = vi.fn();
const detectNode = vi.fn();
const detectGo = vi.fn();

vi.mock('@vercel/python', () => ({ detectEntrypoint: detectPython }));
vi.mock('@vercel/backends', () => ({ detectEntrypoint: detectNode }));
vi.mock('@vercel/go', () => ({ detectEntrypoint: detectGo }));

const { createDetectEntrypoint } = await import(
  '../../../../src/util/projects/detect-entrypoint'
);

describe('createDetectEntrypoint', () => {
  beforeEach(() => {
    detectPython.mockReset();
    detectNode.mockReset();
    detectGo.mockReset();
    detectPython.mockResolvedValue({
      kind: 'py-module:attr',
      entrypoint: 'main:app',
    });
    detectNode.mockResolvedValue({ kind: 'file', entrypoint: 'index.ts' });
    detectGo.mockResolvedValue({ kind: 'file', entrypoint: 'main.go' });
  });

  it('routes Python frameworks to @vercel/python and joins workPath against project root', async () => {
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'services/api',
      framework: 'fastapi',
    });

    expect(detectPython).toHaveBeenCalledWith({
      workPath: '/abs/project/services/api',
      framework: 'fastapi',
    });
    expect(detectNode).not.toHaveBeenCalled();
    expect(detectGo).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'py-module:attr', entrypoint: 'main:app' });
  });

  it('routes Node backend frameworks to @vercel/backends', async () => {
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'backend',
      framework: 'hono',
    });

    expect(detectNode).toHaveBeenCalledWith({
      workPath: '/abs/project/backend',
    });
    expect(detectPython).not.toHaveBeenCalled();
    expect(detectGo).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'file', entrypoint: 'index.ts' });
  });

  it('routes the go runtime framework to @vercel/go', async () => {
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({
      workPath: 'services/svc',
      framework: 'go',
    });

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

    expect(detectPython).not.toHaveBeenCalled();
    expect(detectNode).not.toHaveBeenCalled();
    expect(detectGo).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns null when no framework slug is supplied', async () => {
    const dispatch = createDetectEntrypoint('/abs/project');
    const result = await dispatch({ workPath: 'whatever' });

    expect(detectPython).not.toHaveBeenCalled();
    expect(detectNode).not.toHaveBeenCalled();
    expect(detectGo).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
