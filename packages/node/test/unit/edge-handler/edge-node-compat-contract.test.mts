import { describe, expect, test } from 'vitest';
import {
  NodeCompatBindings,
  createNodeCompatPlugin,
} from '../../../src/edge-functions/edge-node-compat-plugin.mts';

describe('Edge Node compatibility contract', () => {
  test('deduplicates bindings and exposes representative supported APIs', () => {
    const bindings = new NodeCompatBindings();

    expect(bindings.use('node:buffer')).toBe('__vc_node_buffer__');
    expect(bindings.use('node:buffer')).toBe('__vc_node_buffer__');
    expect(bindings.use('node:events')).toBe('__vc_node_events__');
    expect(bindings.use('node:async_hooks')).toBe('__vc_node_async_hooks__');
    expect(bindings.use('node:assert')).toBe('__vc_node_assert__');

    const context = bindings.getContext() as Record<string, any>;
    expect(Object.keys(context)).toHaveLength(4);
    expect(context.__vc_node_buffer__.Buffer).toBe(Buffer);
    expect(context.__vc_node_events__.EventEmitter).toBeTypeOf('function');
    expect(context.__vc_node_async_hooks__.AsyncLocalStorage).toBeTypeOf(
      'function'
    );
    expect(context.__vc_node_assert__.strictEqual).toBeTypeOf('function');
  });

  test('rejects unsupported node bindings with the imported module name', () => {
    const bindings = new NodeCompatBindings();

    expect(() => bindings.use('node:fs')).toThrow(
      'Could not find module node:fs'
    );
  });

  test('canonicalizes bare and node-prefixed imports through the plugin', async () => {
    let resolveHandler!: (args: { path: string }) => Promise<unknown>;
    let loadHandler!: (args: { path: string }) => Promise<any>;
    const builder = {
      onResolve: (_options: unknown, handler: typeof resolveHandler) => {
        resolveHandler = handler;
      },
      onLoad: (_options: unknown, handler: typeof loadHandler) => {
        loadHandler = handler;
      },
    };
    const { plugin, bindings } = createNodeCompatPlugin();
    plugin.setup(builder as any);

    await expect(resolveHandler({ path: 'buffer' })).resolves.toEqual({
      namespace: 'vercel-node-compat',
      path: 'buffer',
    });
    await expect(resolveHandler({ path: 'node:buffer' })).resolves.toEqual({
      namespace: 'vercel-node-compat',
      path: 'node:buffer',
    });
    await expect(loadHandler({ path: 'buffer' })).resolves.toEqual({
      contents: 'module.exports = __vc_node_buffer__;',
      loader: 'js',
    });
    await expect(loadHandler({ path: 'node:buffer' })).resolves.toEqual({
      contents: 'module.exports = __vc_node_buffer__;',
      loader: 'js',
    });
    expect(Object.keys(bindings.getContext())).toEqual(['__vc_node_buffer__']);
  });
});
