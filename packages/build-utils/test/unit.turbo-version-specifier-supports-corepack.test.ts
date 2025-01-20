import { describe, expect, test } from 'vitest';
import { turboVersionSpecifierSupportsCorepack } from '../src/fs/run-user-scripts';

describe('Test `turboRangeSupportsCorepack()`', () => {
  test('should return false for invalid range specifiers', () => {
    expect(turboVersionSpecifierSupportsCorepack('invalid')).toBe(false);
  });

  test('should return false for non range version specifiers', () => {
    expect(turboVersionSpecifierSupportsCorepack('latest')).toBe(false);
  });

  test('should return true for 2.1.4', () => {
    expect(turboVersionSpecifierSupportsCorepack('2.1.4')).toBe(true);
  });

  test('should return false for 2.1.2', () => {
    expect(turboVersionSpecifierSupportsCorepack('2.1.2')).toBe(false);
  });

  test('should return true for 2.1.3', () => {
    expect(turboVersionSpecifierSupportsCorepack('2.1.3')).toBe(true);
  });

  test('should return true for >=2.1.3', () => {
    expect(turboVersionSpecifierSupportsCorepack('>=2.1.3')).toBe(true);
  });
});
