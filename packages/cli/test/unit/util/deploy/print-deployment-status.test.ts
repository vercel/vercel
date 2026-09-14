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

import output from '../../../../src/output-manager';
import { printDeploymentStatus } from '../../../../src/util/deploy/print-deployment-status';

function allPrintedLines(): string[] {
  return vi
    .mocked(output.print)
    .mock.calls.map(call => stripAnsi(call[0]).trim());
}

function fakeClient(argv = ['node', 'vercel']): any {
  return { argv };
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

  it('still prints the Ready line when noWait is true but readyState is already READY', async () => {
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
      () => '0s',
      true, // noWait
      false
    );
    const printed = allPrintedLines();
    const ready = printed.find(l => l.includes('Ready'));
    expect(ready).toBe('✓ Ready in 0s');
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

  it('suggests vercel curl when deployment guidance is enabled', async () => {
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
      true
    );

    expect(allPrintedLines().join('\n')).toContain(
      'vercel curl https://x.vercel.app'
    );
  });

  it('recommends Git with its deployment benefit and exact command', async () => {
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
      true,
      undefined,
      'vercel git connect'
    );

    const printed = allPrintedLines().join('\n');
    expect(printed).toContain(
      'Next steps:\n- Automatically deploy changes on every push by connecting Git:\n  vercel git connect'
    );
    expect(printed).toContain(
      '- Check the deployment response:\n  vercel curl https://x.vercel.app'
    );
    expect(printed).toContain(
      '- View build logs:\n  vercel inspect x.vercel.app --logs'
    );
    expect(printed).toContain(
      '- Create a new deployment from the same source:\n  vercel redeploy x.vercel.app'
    );
    expect(printed).toContain(
      '- Deploy the current project to production:\n  vercel deploy --prod'
    );
  });

  it('shows only safe status guidance while a deployment is still building', async () => {
    await printDeploymentStatus(
      fakeClient(),
      {
        readyState: 'BUILDING',
        alias: [],
        aliasError: undefined as any,
        target: 'preview',
        indications: [],
        url: 'x.vercel.app',
      },
      () => '12s',
      true,
      true,
      undefined,
      'vercel git connect'
    );

    const printed = allPrintedLines().join('\n');
    expect(printed).toContain(
      '- Automatically deploy changes on every push by connecting Git:\n  vercel git connect'
    );
    expect(printed).toContain(
      '- Check deployment status:\n  vercel inspect x.vercel.app'
    );
    expect(printed).not.toContain('vercel curl');
    expect(printed).not.toContain('--logs');
    expect(printed).not.toContain('vercel redeploy');
    expect(printed).not.toContain('vercel deploy --prod');
  });

  it('preserves project context in every deployment command', async () => {
    await printDeploymentStatus(
      fakeClient([
        'node',
        'vercel',
        'deploy',
        '--cwd',
        '/tmp/my-app',
        '--scope',
        'acme',
        '--project',
        'my-app',
      ]),
      {
        readyState: 'READY',
        alias: [],
        aliasError: undefined as any,
        target: 'production',
        indications: [],
        url: 'x.vercel.app',
      },
      () => '12s',
      false,
      true
    );

    const printed = allPrintedLines().join('\n');
    expect(printed).toContain(
      'vercel curl https://x.vercel.app --cwd /tmp/my-app --scope acme --project my-app'
    );
    expect(printed).toContain(
      'vercel inspect x.vercel.app --logs --cwd /tmp/my-app --scope acme --project my-app'
    );
    expect(printed).toContain(
      'vercel redeploy x.vercel.app --cwd /tmp/my-app --scope acme --project my-app'
    );
    expect(printed).not.toContain('vercel deploy --prod');
  });

  it('Ready line has a leading blank line (separates from Aliased row)', async () => {
    // Anti-regression: the prior test uses allPrintedLines() which .trim()s
    // each call, so it cannot catch a regression that removes the leading
    // "\n" from the Ready string. Assert against the raw call argument.
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
      () => '47s',
      false,
      false
    );
    const rawCalls = vi
      .mocked(output.print)
      .mock.calls.map(call => call[0] as string);
    const readyCall = rawCalls.find(c => c.includes('Ready'));
    expect(readyCall).toBeDefined();
    expect(readyCall!.startsWith('\n')).toBe(true);
  });
});
