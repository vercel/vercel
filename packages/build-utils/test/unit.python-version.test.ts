import {
  getSupportedPythonVersion,
  getLatestPythonVersion,
  type PythonVersionMajorMinor,
} from '../src';
import { parsePythonVersion } from '../src/fs/python-version';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 10 * 1000 });

describe('parsePythonVersion', () => {
  it('should parse major.minor versions', () => {
    expect(parsePythonVersion('3.12')).toEqual({ major: 3, minor: 12 });
    expect(parsePythonVersion('3.9')).toEqual({ major: 3, minor: 9 });
    expect(parsePythonVersion('3.14')).toEqual({ major: 3, minor: 14 });
  });

  it('should parse major.minor.patch versions (ignoring patch)', () => {
    expect(parsePythonVersion('3.12.1')).toEqual({ major: 3, minor: 12 });
    expect(parsePythonVersion('3.9.18')).toEqual({ major: 3, minor: 9 });
  });

  it('should return undefined for invalid versions', () => {
    expect(parsePythonVersion('invalid')).toBeUndefined();
    expect(parsePythonVersion('3')).toBeUndefined();
    expect(parsePythonVersion('')).toBeUndefined();
    expect(parsePythonVersion('abc.def')).toBeUndefined();
  });
});

describe('getSupportedPythonVersion with .python-version', () => {
  it('should match supported python version 3.12', () => {
    const result = getSupportedPythonVersion({
      version: '3.12',
      source: '.python-version',
    });
    expect(result).toHaveProperty('minor', 12);
  });

  it('should match supported python version with patch', () => {
    const result = getSupportedPythonVersion({
      version: '3.12.1',
      source: '.python-version',
    });
    expect(result).toHaveProperty('minor', 12);
  });

  it('should throw for invalid python versions', () => {
    const expectedMessage = 'Please set ".python-version" to "3.12".';
    expect(() =>
      getSupportedPythonVersion({
        version: 'invalid',
        source: '.python-version',
      })
    ).toThrow(expectedMessage);
    expect(() =>
      getSupportedPythonVersion({ version: '3', source: '.python-version' })
    ).toThrow(expectedMessage);
  });

  it('should throw for unsupported python versions', () => {
    expect(() =>
      getSupportedPythonVersion({ version: '3.6', source: '.python-version' })
    ).toThrow('Please set ".python-version" to "3.12".');
  });

  it('should throw for version not in available list', () => {
    expect(() =>
      getSupportedPythonVersion(
        { version: '3.11', source: '.python-version' },
        ['3.12']
      )
    ).toThrow(
      'Unsupported Python version "3.11" in .python-version. Please set ".python-version" to "3.12".'
    );
  });

  it('should return latest version when no version specified', () => {
    const result = getSupportedPythonVersion(undefined);
    expect(result).toHaveProperty('major', 3);
    expect(result).toHaveProperty('minor', 12);
  });
});

describe('getSupportedPythonVersion with pyproject.toml', () => {
  it('should match exact version from requires-python', () => {
    const result = getSupportedPythonVersion({
      version: '3.12',
      source: 'pyproject.toml',
    });
    expect(result).toHaveProperty('minor', 12);
  });

  it('should match version with >= specifier', () => {
    const result = getSupportedPythonVersion({
      version: '>=3.12',
      source: 'pyproject.toml',
    });
    expect(result).toHaveProperty('minor', 12);
  });

  it('should match version with ~= compatible release specifier', () => {
    // ~=3.12 means >=3.12 and <4.0
    const result = getSupportedPythonVersion({
      version: '~=3.12',
      source: 'pyproject.toml',
    });
    expect(result).toHaveProperty('minor', 12);
  });

  it('should match version with compound specifiers', () => {
    // Common pattern: >=3.10,<3.13
    const result = getSupportedPythonVersion({
      version: '>=3.10,<3.13',
      source: 'pyproject.toml',
    });
    expect(result).toHaveProperty('minor', 12);
  });

  it('should throw when upper bound excludes all versions', () => {
    expect(() =>
      getSupportedPythonVersion({
        version: '>=3.10,<3.12',
        source: 'pyproject.toml',
      })
    ).toThrow('No supported Python version matches ">=3.10,<3.12"');
  });

  it('should throw when no version satisfies specifier', () => {
    expect(() =>
      getSupportedPythonVersion({
        version: '>=3.99',
        source: 'pyproject.toml',
      })
    ).toThrow('No supported Python version matches ">=3.99"');
  });
});

describe('getLatestPythonVersion', () => {
  it('should get matching version from available versions list', () => {
    const result = getLatestPythonVersion(['3.12']);
    expect(result).toHaveProperty('major', 3);
    expect(result).toHaveProperty('minor', 12);
  });

  it('should fallback to first version when no available versions match', () => {
    const result = getLatestPythonVersion(['3.99' as PythonVersionMajorMinor]);
    expect(result).toHaveProperty('major', 3);
    expect(result).toHaveProperty('minor', 12);
  });
});
