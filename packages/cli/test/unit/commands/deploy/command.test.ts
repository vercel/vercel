import { describe, expect, it } from 'vitest';
import {
  deployCommand,
  initSubcommand,
  continueSubcommand,
} from '../../../../src/commands/deploy/command';

describe('deployCommand', () => {
  it('includes --dry-run option', () => {
    const option = deployCommand.options.find(o => o.name === 'dry-run');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('includes --describe option', () => {
    const option = deployCommand.options.find(o => o.name === 'describe');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('still includes existing options', () => {
    const force = deployCommand.options.find(o => o.name === 'force');
    expect(force).toBeDefined();

    const prod = deployCommand.options.find(o => o.name === 'prod');
    expect(prod).toBeDefined();
    expect(prod!.type).toBe(Boolean);

    const env = deployCommand.options.find(o => o.name === 'env');
    expect(env).toBeDefined();

    const target = deployCommand.options.find(o => o.name === 'target');
    expect(target).toBeDefined();
    expect(target!.type).toBe(String);
  });

  it('has correct total number of options', () => {
    // 22 existing options + dryRunOption + describeOption = 24
    expect(deployCommand.options).toHaveLength(24);
  });
});

describe('initSubcommand', () => {
  it('includes --dry-run option', () => {
    const option = initSubcommand.options.find(o => o.name === 'dry-run');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('includes --describe option', () => {
    const option = initSubcommand.options.find(o => o.name === 'describe');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('has correct total number of options', () => {
    // 15 existing options + dryRunOption + describeOption = 17
    expect(initSubcommand.options).toHaveLength(17);
  });
});

describe('continueSubcommand', () => {
  it('includes --dry-run option', () => {
    const option = continueSubcommand.options.find(o => o.name === 'dry-run');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('includes --describe option', () => {
    const option = continueSubcommand.options.find(o => o.name === 'describe');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('has correct total number of options', () => {
    // 2 existing options + dryRunOption + describeOption = 4
    expect(continueSubcommand.options).toHaveLength(4);
  });
});
