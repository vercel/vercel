import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    print: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/util/agent/auto-install-agentic', () => ({
  showPluginTipIfNeeded: vi.fn().mockResolvedValue(undefined),
}));

import output from '../../../../src/output-manager';
import { printDeploymentStatus } from '../../../../src/util/deploy/print-deployment-status';

function allPrintedLines(): string[] {
  return vi
    .mocked(output.print)
    .mock.calls.map(call => stripAnsi(call[0]).trimEnd());
}

function fakeClient(): any {
  return { argv: ['node', 'vercel'] };
}

describe('printDeploymentStatus() — ready terminal state', () => {
  beforeEach(() => {
    vi.mocked(output.print).mockClear();
  });

  it('prints `✓ Ready in 47s` when deploy reaches READY', async () => {
    const deployStamp = () => '47s';
    const exitCode = await printDeploymentStatus(
      fakeClient(),
      {
        readyState: 'READY',
        alias: [],
        aliasError: undefined as any,
        target: 'production',
        indications: [],
        url: 'my-tan-test-37ihnf3l2-rauchg.vercel.app',
      },
      deployStamp,
      false,
      false
    );

    expect(exitCode).toBe(0);
    const printed = allPrintedLines();
    const ready = printed.find(l => l.includes('Ready'));
    expect(ready).toBeDefined();
    expect(ready).toBe('✓ Ready in 47s');
  });

  it('places ✓ at column 0', async () => {
    await printDeploymentStatus(
      fakeClient(),
      {
        readyState: 'READY',
        alias: [],
        aliasError: undefined as any,
        target: 'production',
        indications: [],
        url: 'x.vercel.app',
      },
      () => '2s',
      false,
      false
    );
    const printed = allPrintedLines();
    const ready = printed.find(l => l.includes('Ready'));
    expect(ready?.indexOf('✓')).toBe(0);
  });

  it('does NOT print the Ready line when noWait is true (deploy still building)', async () => {
    await printDeploymentStatus(
      fakeClient(),
      {
        readyState: 'BUILDING',
        alias: [],
        aliasError: undefined as any,
        target: 'production',
        indications: [],
        url: 'x.vercel.app',
      },
      () => '2s',
      true, // noWait
      false
    );
    const printed = allPrintedLines();
    expect(printed.some(l => l.includes('Ready in'))).toBe(false);
  });

  it('prints the Ready line for preview deploys too', async () => {
    await printDeploymentStatus(
      fakeClient(),
      {
        readyState: 'READY',
        alias: [],
        aliasError: undefined as any,
        target: 'preview',
        indications: [],
        url: 'x.vercel.app',
      },
      () => '12s',
      false,
      false
    );
    const printed = allPrintedLines();
    const ready = printed.find(l => l.includes('Ready'));
    expect(ready).toBe('✓ Ready in 12s');
  });
});
