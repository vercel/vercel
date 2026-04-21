import { describe, expect, it } from 'vitest';
import {
  foldNamingStyle,
  operationIdToKebabCase,
} from '../../../../src/util/openapi/fold-naming-style';

describe('foldNamingStyle', () => {
  it('treats kebab, snake, and camel as equivalent', () => {
    const a = foldNamingStyle('project-routes');
    expect(foldNamingStyle('project_routes')).toBe(a);
    expect(foldNamingStyle('projectRoutes')).toBe(a);
    expect(foldNamingStyle('ProjectRoutes')).toBe(a);
  });

  it('handles access-groups vs accessGroups', () => {
    expect(foldNamingStyle('access-groups')).toBe(
      foldNamingStyle('accessGroups')
    );
  });

  it('handles listEventTypes vs list-event-types', () => {
    expect(foldNamingStyle('listEventTypes')).toBe(
      foldNamingStyle('list-event-types')
    );
  });

  it('is case-insensitive', () => {
    expect(foldNamingStyle('User')).toBe(foldNamingStyle('user'));
  });
});

describe('operationIdToKebabCase', () => {
  it('converts camelCase operationIds to kebab-case', () => {
    expect(operationIdToKebabCase('getAuthUser')).toBe('get-auth-user');
    expect(operationIdToKebabCase('listEventTypes')).toBe('list-event-types');
  });

  it('normalizes existing separators', () => {
    expect(operationIdToKebabCase('list_event_types')).toBe('list-event-types');
    expect(operationIdToKebabCase('list-event-types')).toBe('list-event-types');
  });

  it('uses unnamed for empty input', () => {
    expect(operationIdToKebabCase('')).toBe('unnamed');
  });
});
