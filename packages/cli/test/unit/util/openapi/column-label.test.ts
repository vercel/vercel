import { describe, expect, it } from 'vitest';
import {
  humanizeIdentifier,
  humanReadableColumnLabel,
} from '../../../../src/util/openapi/column-label';

describe('humanizeIdentifier', () => {
  it('splits camelCase', () => {
    expect(humanizeIdentifier('blockedAt')).toBe('Blocked At');
    expect(humanizeIdentifier('defaultTeamId')).toBe('Default Team Id');
  });

  it('splits snake_case', () => {
    expect(humanizeIdentifier('soft_block')).toBe('Soft Block');
  });

  it('splits kebab-case', () => {
    expect(humanizeIdentifier('project-id')).toBe('Project Id');
  });

  it('handles single word', () => {
    expect(humanizeIdentifier('email')).toBe('Email');
  });
});

describe('humanReadableColumnLabel', () => {
  it('joins path segments with a separator', () => {
    expect(humanReadableColumnLabel('softBlock.blockedAt')).toBe(
      'Soft Block › Blocked At'
    );
  });
});
