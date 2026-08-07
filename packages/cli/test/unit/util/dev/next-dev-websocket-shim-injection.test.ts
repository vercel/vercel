import { describe, expect, it } from 'vitest';
import {
  injectNextDevWebSocketShimIfNeeded,
  prependNodeRequireOption,
  shouldInjectNextDevWebSocketShim,
} from '../../../../src/util/dev/next-dev-websocket-shim-injection';

describe('Next.js dev WebSocket shim injection', () => {
  it('detects Next.js dev commands', () => {
    expect(shouldInjectNextDevWebSocketShim('next')).toBe(true);
    expect(shouldInjectNextDevWebSocketShim('next -p 3000')).toBe(true);
    expect(shouldInjectNextDevWebSocketShim('next dev --port 3000')).toBe(true);
    expect(shouldInjectNextDevWebSocketShim('pnpm next dev')).toBe(true);
    expect(shouldInjectNextDevWebSocketShim('next build')).toBe(false);
    expect(shouldInjectNextDevWebSocketShim('vite dev')).toBe(false);
  });

  it('detects Next.js project settings when the command is generic', () => {
    expect(
      shouldInjectNextDevWebSocketShim('pnpm dev', { framework: 'nextjs' })
    ).toBe(true);
    expect(
      shouldInjectNextDevWebSocketShim('pnpm dev', { framework: 'vite' })
    ).toBe(false);
  });

  it('prepends the shim require to existing NODE_OPTIONS', () => {
    expect(prependNodeRequireOption('--trace-warnings', '/tmp/shim.cjs')).toBe(
      '--require "/tmp/shim.cjs" --trace-warnings'
    );
  });

  it('mutates NODE_OPTIONS when injection is needed', () => {
    const env = { NODE_OPTIONS: '--trace-warnings' };

    const shimPath = injectNextDevWebSocketShimIfNeeded(env, 'pnpm dev', {
      framework: 'nextjs',
    });

    expect(shimPath).toContain('next-dev-websocket-shim-preload.cjs');
    expect(env.NODE_OPTIONS).toBe(
      `--require ${JSON.stringify(shimPath)} --trace-warnings`
    );
  });

  it('leaves NODE_OPTIONS unchanged when injection is not needed', () => {
    const env = { NODE_OPTIONS: '--trace-warnings' };

    expect(injectNextDevWebSocketShimIfNeeded(env, 'vite dev')).toBeUndefined();
    expect(env.NODE_OPTIONS).toBe('--trace-warnings');
  });
});
