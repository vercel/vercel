import { resolveProjectPath } from '../../../../src/util/dev/path-resolution';

describe('Dev command path resolution', () => {
  it('should not duplicate paths when rootDirectory is already in cwd', () => {
    const cwd = '/Users/lassiter/code/someproject/apps/nextbigthing';
    const repoRoot = '/Users/lassiter/code/someproject';
    const rootDirectory = 'apps/nextbigthing';

    const result = resolveProjectPath(cwd, repoRoot, rootDirectory);

    // Should not duplicate the path
    expect(result).toBe('/Users/lassiter/code/someproject/apps/nextbigthing');
    expect(result).not.toBe(
      '/Users/lassiter/code/someproject/apps/nextbigthing/apps/nextbigthing'
    );
  });

  it('should join paths when rootDirectory is not in cwd', () => {
    const cwd = '/Users/lassiter/code/someproject';
    const repoRoot = '/Users/lassiter/code/someproject';
    const rootDirectory = 'apps/nextbigthing';

    const result = resolveProjectPath(cwd, repoRoot, rootDirectory);

    // Should join the paths correctly
    expect(result).toBe('/Users/lassiter/code/someproject/apps/nextbigthing');
  });

  it('should handle Windows paths correctly', () => {
    const cwd = 'C:\\Users\\lassiter\\code\\someproject\\apps\\nextbigthing';
    const repoRoot = 'C:\\Users\\lassiter\\code\\someproject';
    const rootDirectory = 'apps\\nextbigthing';

    const result = resolveProjectPath(cwd, repoRoot, rootDirectory);

    // Should not duplicate the path even with Windows separators
    // Note: join() normalizes separators, so we expect forward slashes
    expect(result).toBe(
      'C:\\Users\\lassiter\\code\\someproject/apps\\nextbigthing'
    );
  });

  it('should handle case where no rootDirectory is specified', () => {
    const cwd = '/Users/lassiter/code/someproject';
    const repoRoot = '/Users/lassiter/code/someproject';
    const rootDirectory = undefined;

    const result = resolveProjectPath(cwd, repoRoot, rootDirectory);

    // Should return the repo root
    expect(result).toBe('/Users/lassiter/code/someproject');
  });

  it('should handle case where no repoRoot is specified', () => {
    const cwd = '/Users/lassiter/code/someproject/apps/nextbigthing';
    const repoRoot = undefined;
    const rootDirectory = 'apps/nextbigthing';

    const result = resolveProjectPath(cwd, repoRoot, rootDirectory);

    // Should not duplicate since rootDirectory is already in cwd
    expect(result).toBe('/Users/lassiter/code/someproject/apps/nextbigthing');
  });
});
