import { describe, expect, it } from 'vitest';
import { loginCommand } from '../../../../src/commands/login/command';

describe('loginCommand', () => {
  it('includes --dry-run option', () => {
    const option = loginCommand.options.find(o => o.name === 'dry-run');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('includes --describe option', () => {
    const option = loginCommand.options.find(o => o.name === 'describe');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('still includes existing deprecated options', () => {
    const github = loginCommand.options.find(o => o.name === 'github');
    expect(github).toBeDefined();
    expect(github!.deprecated).toBe(true);

    const oob = loginCommand.options.find(o => o.name === 'oob');
    expect(oob).toBeDefined();
    expect(oob!.deprecated).toBe(true);
  });

  it('has correct total number of options', () => {
    // 5 existing deprecated options + dryRunOption + describeOption = 7
    expect(loginCommand.options).toHaveLength(7);
  });
});
