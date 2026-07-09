import { describe, expect, it } from 'vitest';
import { printCommand } from '../../../../src/util/sandbox/print-command';

describe('printCommand', () => {
  it('formats a command with its arguments', () => {
    expect(printCommand('node', ['x.js'])).toContain('$ node x.js');
  });

  it('handles no arguments', () => {
    expect(printCommand('ls', [])).toContain('$ ls');
  });
});
