import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALIGNED_LABEL_WIDTH,
  printAlignedLabel,
} from '../../../../src/util/output/print-aligned-label';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    print: vi.fn(),
  },
}));

import output from '../../../../src/output-manager';

function lastPrinted(): string {
  const calls = vi.mocked(output.print).mock.calls;
  return calls[calls.length - 1][0];
}

// Layout:
//   "  " (2-char prefix, cols 0-1) + label padded to 12 (cols 2-13) + value (col 14+)
// With a gutter, "  " becomes "${gutter} " — value column stays at 14.
const VALUE_COL = 14;

describe('printAlignedLabel()', () => {
  beforeEach(() => {
    vi.mocked(output.print).mockClear();
  });

  it('exports a 12-char aligned label width', () => {
    expect(ALIGNED_LABEL_WIDTH).toBe(12);
  });

  it('emits 2-space indent + bold padded label + bold value + trailing newline', () => {
    printAlignedLabel('Linked', 'acme/web');
    const raw = lastPrinted();
    const plain = stripAnsi(raw);

    expect(plain).toBe(`  Linked      acme/web\n`);
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.startsWith(`  ${chalk.bold('Linked      ')}`)).toBe(true);
    expect(raw).toContain(chalk.bold('acme/web'));
  });

  it('pads `Linked` (6 chars) with 6 spaces so value lands at col 14', () => {
    printAlignedLabel('Linked', 'X');
    const plain = stripAnsi(lastPrinted());
    expect(plain).toBe('  Linked      X\n');
    expect(plain.indexOf('X')).toBe(VALUE_COL);
  });

  it('pads `Inspect` (7 chars) with 5 spaces so value lands at col 14', () => {
    printAlignedLabel('Inspect', 'X');
    const plain = stripAnsi(lastPrinted());
    expect(plain).toBe('  Inspect     X\n');
    expect(plain.indexOf('X')).toBe(VALUE_COL);
  });

  it('pads `Production` (10 chars) with 2 spaces so value lands at col 14', () => {
    printAlignedLabel('Production', 'X');
    const plain = stripAnsi(lastPrinted());
    expect(plain).toBe('  Production  X\n');
    expect(plain.indexOf('X')).toBe(VALUE_COL);
  });

  it('pads `Preview` (7 chars) with 5 spaces so value lands at col 14', () => {
    printAlignedLabel('Preview', 'X');
    const plain = stripAnsi(lastPrinted());
    expect(plain).toBe('  Preview     X\n');
    expect(plain.indexOf('X')).toBe(VALUE_COL);
  });

  it('all canonical labels align values at the same column', () => {
    const labels = ['Linked', 'Inspect', 'Production', 'Preview'];
    const cols = labels.map(label => {
      vi.mocked(output.print).mockClear();
      printAlignedLabel(label, 'VALUE');
      return stripAnsi(lastPrinted()).indexOf('VALUE');
    });
    expect(new Set(cols).size).toBe(1);
    expect(cols[0]).toBe(VALUE_COL);
  });

  describe('gutter option', () => {
    it('renders `▲ Production  <value>` when gutter is set', () => {
      printAlignedLabel('Production', 'https://example.com', { gutter: '▲' });
      const plain = stripAnsi(lastPrinted());
      expect(plain).toBe('▲ Production  https://example.com\n');
    });

    it('keeps value column aligned with the non-gutter case', () => {
      vi.mocked(output.print).mockClear();
      printAlignedLabel('Linked', 'VALUE');
      const plainNoGutter = stripAnsi(lastPrinted());

      vi.mocked(output.print).mockClear();
      printAlignedLabel('Production', 'VALUE', { gutter: '▲' });
      const plainGutter = stripAnsi(lastPrinted());

      // Both should land 'VALUE' at col 14 (2-char prefix + 12-char label)
      expect(plainNoGutter.indexOf('VALUE')).toBe(VALUE_COL);
      expect(plainGutter.indexOf('VALUE')).toBe(VALUE_COL);
    });

    it('places the gutter glyph in col 0', () => {
      printAlignedLabel('Production', 'X', { gutter: '▲' });
      const plain = stripAnsi(lastPrinted());
      expect(plain.indexOf('▲')).toBe(0);
    });
  });
});
