import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    print: vi.fn(),
  },
}));

import output from '../../../../src/output-manager';
import { printPrebuiltFilePathMapIgnoreWarning } from '../../../../src/util/deploy/print-prebuilt-filepathmap-warning';

describe('printPrebuiltFilePathMapIgnoreWarning()', () => {
  const telemetry = {
    trackPrebuiltFilePathMapWouldFailClosed: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(output.print).mockClear();
    telemetry.trackPrebuiltFilePathMapWouldFailClosed.mockClear();
  });

  it('prints the warning with a `!` gutter on the first line', () => {
    printPrebuiltFilePathMapIgnoreWarning(
      [
        '`.vercelignore` excludes 2 files the prebuilt functions need. An upcoming CLI release will fail this deploy instead of uploading without them.',
        '',
        '  README.md',
        '',
        'Remove the colliding rules from `.vercelignore`, or exclude those paths from tracing with `outputFileTracingExcludes`.',
      ].join('\n'),
      telemetry
    );

    const printed = vi
      .mocked(output.print)
      .mock.calls.map(call => stripAnsi(String(call[0])));

    expect(printed[0]).toMatch(/^! `/);
    expect(printed.join('')).toContain('upcoming CLI release will fail');
    expect(printed.join('')).toContain('README.md');
    expect(printed.at(-1)).toBe(
      '  Remove the colliding rules from `.vercelignore`, or exclude those paths from tracing with `outputFileTracingExcludes`.\n'
    );
    expect(printed.join('')).not.toContain('WARNING!');
  });

  it('records telemetry that the deploy would fail closed', () => {
    printPrebuiltFilePathMapIgnoreWarning(
      [
        '`.vercelignore` excludes 1 file the prebuilt functions need. An upcoming CLI release will fail this deploy instead of uploading without them.',
        '',
        '  .env',
        '',
        'Remove the colliding rules from `.vercelignore`, or exclude those paths from tracing with `outputFileTracingExcludes`.',
      ].join('\n'),
      telemetry
    );

    expect(
      telemetry.trackPrebuiltFilePathMapWouldFailClosed
    ).toHaveBeenCalledTimes(1);
    expect(
      telemetry.trackPrebuiltFilePathMapWouldFailClosed
    ).toHaveBeenCalledWith();
  });
});
