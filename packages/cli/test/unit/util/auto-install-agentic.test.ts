import { describe, expect, it } from 'vitest';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import {
  buildClaudeActionRequiredMessage,
  buildClaudePromptCopy,
  buildClaudePluginMigrationPlan,
  buildClaudePluginStatus,
  comparePluginVersions,
  getPluginTargetForAgent,
} from '../../../src/util/agent/auto-install-agentic';

describe('comparePluginVersions', () => {
  it('compares dot-separated versions', () => {
    expect(comparePluginVersions('0.32.7', '0.32.7')).toBe(0);
    expect(comparePluginVersions('0.32.8', '0.32.7')).toBe(1);
    expect(comparePluginVersions('0.32.7', '0.32.8')).toBe(-1);
    expect(comparePluginVersions('1.0.0', '0.99.9')).toBe(1);
  });
});

describe('getPluginTargetForAgent', () => {
  it('maps Claude Code agents to the Claude plugin target', () => {
    expect(getPluginTargetForAgent(KNOWN_AGENTS.CLAUDE)).toBe('claude-code');
    expect(getPluginTargetForAgent(KNOWN_AGENTS.COWORK)).toBe('claude-code');
  });

  it('does not map Codex to a Claude plugin target', () => {
    expect(getPluginTargetForAgent(KNOWN_AGENTS.CODEX)).toBeUndefined();
  });
});

describe('buildClaudePluginStatus', () => {
  it('detects a legacy-only install', () => {
    const status = buildClaudePluginStatus(
      [{ id: 'vercel-plugin@vercel', version: '0.22.0' }],
      '0.32.7'
    );

    expect(status.state).toBe('legacy-only');
    expect(status.legacy?.version).toBe('0.22.0');
    expect(status.official).toBeUndefined();
    expect(status.latestVersion).toBe('0.32.7');
  });

  it('detects an official-only install', () => {
    const status = buildClaudePluginStatus([
      { id: 'vercel@claude-plugins-official', version: '0.32.7' },
    ]);

    expect(status.state).toBe('official-only');
    expect(status.legacy).toBeUndefined();
    expect(status.official?.version).toBe('0.32.7');
  });

  it('detects both installs', () => {
    const status = buildClaudePluginStatus([
      { id: 'vercel-plugin@vercel', version: '0.32.6' },
      { id: 'vercel@claude-plugins-official', version: '0.32.7' },
    ]);

    expect(status.state).toBe('both');
    expect(status.legacy?.version).toBe('0.32.6');
    expect(status.official?.version).toBe('0.32.7');
  });
});

describe('buildClaudePluginMigrationPlan', () => {
  it('installs the official plugin for a missing install', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'none',
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: true,
      updateOfficial: false,
      removeLegacy: false,
      removeLegacyMarketplace: false,
    });
  });

  it('migrates a legacy-only install', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'legacy-only',
      legacy: { id: 'vercel-plugin@vercel', version: '0.22.0' },
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: true,
      updateOfficial: false,
      removeLegacy: true,
      removeLegacyMarketplace: true,
    });
  });

  it('updates an outdated official install', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'official-only',
      official: { id: 'vercel@claude-plugins-official', version: '0.32.6' },
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: false,
      updateOfficial: true,
      removeLegacy: false,
      removeLegacyMarketplace: false,
    });
  });

  it('removes the legacy install when both are present', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'both',
      legacy: { id: 'vercel-plugin@vercel', version: '0.32.6' },
      official: { id: 'vercel@claude-plugins-official', version: '0.32.7' },
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: false,
      updateOfficial: false,
      removeLegacy: true,
      removeLegacyMarketplace: true,
    });
  });
});

describe('buildClaudePromptCopy', () => {
  it('uses install copy for a missing Claude install', () => {
    const copy = buildClaudePromptCopy(
      { state: 'none', latestVersion: '0.32.7' },
      {
        installOfficial: true,
        updateOfficial: false,
        removeLegacy: false,
        removeLegacyMarketplace: false,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('Would you like to install it?');
  });

  it('uses migration copy for the old Claude marketplace install', () => {
    const copy = buildClaudePromptCopy(
      {
        state: 'legacy-only',
        legacy: { id: 'vercel-plugin@vercel', version: '0.22.0' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: true,
        updateOfficial: false,
        removeLegacy: true,
        removeLegacyMarketplace: true,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('Would you like to update it?');
  });

  it('uses cleanup copy when both Claude installs exist', () => {
    const copy = buildClaudePromptCopy(
      {
        state: 'both',
        legacy: { id: 'vercel-plugin@vercel', version: '0.32.6' },
        official: { id: 'vercel@claude-plugins-official', version: '0.32.7' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: false,
        updateOfficial: false,
        removeLegacy: true,
        removeLegacyMarketplace: true,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('Would you like to update it?');
  });

  it('uses update copy for an outdated official Claude install', () => {
    const copy = buildClaudePromptCopy(
      {
        state: 'official-only',
        official: { id: 'vercel@claude-plugins-official', version: '0.32.6' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: false,
        updateOfficial: true,
        removeLegacy: false,
        removeLegacyMarketplace: false,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('0.32.6 to 0.32.7');
  });
});

describe('buildClaudeActionRequiredMessage', () => {
  it('uses marketplace upgrade wording for legacy Claude installs', () => {
    const message = buildClaudeActionRequiredMessage(
      {
        state: 'legacy-only',
        legacy: { id: 'vercel-plugin@vercel', version: '0.22.0' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: true,
        updateOfficial: false,
        removeLegacy: true,
        removeLegacyMarketplace: true,
      }
    );

    expect(message).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(message).toContain(
      'claude plugins install vercel@claude-plugins-official'
    );
    expect(message).toContain('claude plugins uninstall vercel-plugin@vercel');
  });
});
