import { describe, expect, it } from 'vitest';
import { linkCommand } from '../../../../src/commands/link/command';

describe('linkCommand', () => {
  it('includes --dry-run option', () => {
    const option = linkCommand.options.find(o => o.name === 'dry-run');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('includes --describe option', () => {
    const option = linkCommand.options.find(o => o.name === 'describe');
    expect(option).toBeDefined();
    expect(option!.type).toBe(Boolean);
    expect(option!.deprecated).toBe(false);
  });

  it('still includes existing options', () => {
    const repo = linkCommand.options.find(o => o.name === 'repo');
    expect(repo).toBeDefined();
    expect(repo!.deprecated).toBe(false);

    const project = linkCommand.options.find(o => o.name === 'project');
    expect(project).toBeDefined();
    expect(project!.type).toBe(String);

    const team = linkCommand.options.find(o => o.name === 'team');
    expect(team).toBeDefined();
    expect(team!.type).toBe(String);
  });

  it('has correct total number of options', () => {
    // 5 existing options (repo, project, team, yes, confirm) + dryRunOption + describeOption = 7
    expect(linkCommand.options).toHaveLength(7);
  });
});
