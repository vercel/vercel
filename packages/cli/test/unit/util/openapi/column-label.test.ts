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

  it('uses short label for updatedAt', () => {
    expect(humanReadableColumnLabel('updatedAt')).toBe('Updated');
  });

  it('uses short label for createdAt', () => {
    expect(humanReadableColumnLabel('createdAt')).toBe('Created');
  });

  it('uses override for nodeVersion', () => {
    expect(humanReadableColumnLabel('nodeVersion')).toBe('Node Version');
  });

  it('falls back to humanizeIdentifier for unknown fields', () => {
    expect(humanReadableColumnLabel('someCustomField')).toBe(
      'Some Custom Field'
    );
  });

  it('applies overrides per-segment in dot paths', () => {
    expect(humanReadableColumnLabel('project.updatedAt')).toBe(
      'Project › Updated'
    );
  });
});
