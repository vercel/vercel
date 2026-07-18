import { describe, expect, it } from 'vitest';
import { BASIC_COMMANDS, help } from '../../../src/help';
import { commandsStructs } from '../../../src/commands';

describe('root help output', () => {
  const output = help();

  it('curated grouping only names registered commands', () => {
    // Guards against renames/removals leaving stale entries in the
    // hand-maintained grouping list (the lines themselves are generated).
    const registered = new Set(commandsStructs.map(command => command.name));
    for (const name of BASIC_COMMANDS) {
      expect(registered.has(name), `BASIC_COMMANDS entry "${name}"`).toBe(true);
    }
  });

  it('lists every registered visible command', () => {
    for (const command of commandsStructs) {
      if ('hidden' in command && command.hidden) continue;
      expect(output).toContain(` ${command.name} `);
    }
  });

  it('does not list unregistered commands', () => {
    // Previously drifted in as hand-maintained text (never a real command).
    expect(output).not.toContain('oauth-apps');
  });

  it('lists the agent-runs command with its metadata description', () => {
    expect(output).toMatch(/agent-runs\s+\[cmd\]\s+Inspect Agent Runs/);
  });

  it('renders aliases and the default marker', () => {
    expect(output).toContain('rr | rolling-release');
    expect(output).toContain('(default)');
  });

  it('renders global options from shared metadata', () => {
    expect(output).toContain('--non-interactive');
    expect(output).toMatch(/-t, --token/);
  });

  it('keeps groups and examples', () => {
    expect(output).toContain('Basic');
    expect(output).toContain('Advanced');
    expect(output).toContain('$ vercel help list');
  });
});
