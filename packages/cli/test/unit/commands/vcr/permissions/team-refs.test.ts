import { describe, expect, it } from 'vitest';
import {
  parseTeamRefs,
  teamRefBody,
} from '../../../../../src/commands/vcr/permissions/team-refs';

describe('parseTeamRefs', () => {
  it('returns an empty list for no arguments', () => {
    expect(parseTeamRefs([])).toEqual([]);
  });

  it('parses a single team reference', () => {
    expect(parseTeamRefs(['team_123'])).toEqual(['team_123']);
  });

  it('splits comma-separated references within one argument', () => {
    expect(parseTeamRefs(['team_123,my-team'])).toEqual([
      'team_123',
      'my-team',
    ]);
  });

  it('collects references across multiple arguments', () => {
    expect(parseTeamRefs(['team_123', 'my-team'])).toEqual([
      'team_123',
      'my-team',
    ]);
  });

  it('mixes comma-separated and positional references', () => {
    expect(parseTeamRefs(['team_123,my-team', 'other-team'])).toEqual([
      'team_123',
      'my-team',
      'other-team',
    ]);
  });

  it('trims whitespace around references', () => {
    expect(parseTeamRefs([' team_123 , my-team '])).toEqual([
      'team_123',
      'my-team',
    ]);
  });

  it('ignores empty pieces from stray commas', () => {
    expect(parseTeamRefs(['team_123,,my-team,', ','])).toEqual([
      'team_123',
      'my-team',
    ]);
  });

  it('removes duplicates while preserving first-seen order', () => {
    expect(
      parseTeamRefs(['team_123,my-team', 'team_123', 'my-team,other-team'])
    ).toEqual(['team_123', 'my-team', 'other-team']);
  });
});

describe('teamRefBody', () => {
  it('treats refs with a team_ prefix as team ids', () => {
    expect(teamRefBody('team_123')).toEqual({ teamId: 'team_123' });
  });

  it('treats other refs as team slugs', () => {
    expect(teamRefBody('my-team')).toEqual({ teamSlug: 'my-team' });
  });

  it('only detects the team_ prefix at the start of the ref', () => {
    expect(teamRefBody('my-team_123')).toEqual({ teamSlug: 'my-team_123' });
  });
});
