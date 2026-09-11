import { describe, expect, it } from 'vitest';
import { normalizeRootDirectory } from '../../../../src/util/projects/project-settings';

describe('normalizeRootDirectory', () => {
  it('should normalize away a root directory of the repository root', () => {
    // `repo.json` and the Project Settings spell the repository root as "."
    expect(normalizeRootDirectory('.')).toBeUndefined();
    expect(normalizeRootDirectory('./')).toBeUndefined();
    expect(normalizeRootDirectory('')).toBeUndefined();
    expect(normalizeRootDirectory(null)).toBeUndefined();
    expect(normalizeRootDirectory(undefined)).toBeUndefined();
  });

  it('should pass a subdirectory through unchanged', () => {
    expect(normalizeRootDirectory('app')).toEqual('app');
    expect(normalizeRootDirectory('apps/web')).toEqual('apps/web');
  });

  it('should strip a leading "./" and trailing slashes', () => {
    expect(normalizeRootDirectory('./apps/web')).toEqual('apps/web');
    expect(normalizeRootDirectory('apps/web/')).toEqual('apps/web');
  });
});
