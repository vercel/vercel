import { describe, expect, it } from 'vitest';
import { formatPreflight } from '../../../../src/commands/onboard/preflight';

describe('preflight formatting', () => {
  const base = {
    cliVersion: '58.0.0',
    linked: false,
    skillInstalled: false,
  };

  it('renders the marketplace catalog with the browse fallback', () => {
    const rendered = formatPreflight({
      ...base,
      marketplace: [
        { slug: 'neon', name: 'Neon', description: 'Serverless Postgres' },
        { slug: 'upstash', name: 'Upstash' },
      ],
    });

    expect(rendered).toContain('neon (Neon) — Serverless Postgres');
    expect(rendered).toContain('upstash (Upstash)');
    // The catalog is a shortcut, never the only path: the agent must be told
    // it can still browse when the pre-fetched list does not cover the need.
    expect(rendered).toContain('vercel integration discover');
  });

  it('says nothing about the marketplace when the catalog was unavailable', () => {
    const rendered = formatPreflight(base);
    expect(rendered).not.toContain('Marketplace catalog');
  });

  it('renders task-relevant recipes above the catalog when a need was detected', () => {
    const rendered = formatPreflight({
      ...base,
      team: 'acme-team',
      intelligence: {
        workspaceManagers: [],
        frameworks: [],
        services: [],
        intentFiles: [],
        migrationSignals: [
          {
            kind: 'sqlite-runtime',
            source: 'server/db.js',
            evidence: 'Runtime SQLite usage: `…`',
            confidence: 'high',
          },
        ],
      },
      marketplace: [
        { slug: 'neon', name: 'Neon', description: 'Serverless Postgres' },
        { slug: 'upstash', name: 'Upstash' },
      ],
    });

    expect(rendered).toContain('Detected stateful needs');
    expect(rendered).toContain('Need: postgres');
    expect(rendered).toContain(
      'vercel integration add neon --name <resource-name> --scope acme-team'
    );
    // The full catalog stays as the fallback, after the recipes.
    expect(rendered.indexOf('Detected stateful needs')).toBeLessThan(
      rendered.indexOf('Marketplace catalog')
    );
  });

  it('renders no recipes when detection saw no stateful need', () => {
    const rendered = formatPreflight({
      ...base,
      intelligence: {
        workspaceManagers: [],
        frameworks: [],
        services: [],
        intentFiles: [],
        migrationSignals: [],
      },
      marketplace: [{ slug: 'neon', name: 'Neon' }],
    });
    expect(rendered).not.toContain('Detected stateful needs');
    expect(rendered).toContain('Marketplace catalog');
  });

  it('states a pinned team as decided and withholds the alternatives', () => {
    const rendered = formatPreflight({
      ...base,
      team: 'acme',
      teamPinned: true,
      teams: ['acme', 'other-team'],
    });

    expect(rendered).toContain('Team for this session: acme');
    expect(rendered).toContain('Do not ask');
    // The list of alternatives invites second-guessing a settled decision.
    expect(rendered).not.toContain('other-team');
  });

  it('lists the teams when none was pinned', () => {
    const rendered = formatPreflight({
      ...base,
      team: 'acme',
      teams: ['acme', 'other-team'],
    });

    expect(rendered).toContain('Team in scope: acme');
    expect(rendered).toContain('Teams available');
    expect(rendered).toContain('other-team');
  });
});
