import { expect } from 'vitest';

/**
 * Checks that the JSON result from a renamed option's old name is the one
 * from its new name, plus the deprecation warning in its `warnings` list.
 */
export function expectDeprecationInJson(
  before: string,
  now: string,
  message: string
) {
  const result = JSON.parse(now);
  expect(result).not.toHaveProperty('warnings');
  expect(JSON.parse(before)).toEqual({
    ...result,
    warnings: [{ reason: 'deprecated', message }],
  });
}
