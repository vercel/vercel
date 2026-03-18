import { describe, it, expect } from 'vitest';
import { parseUvLock } from '../src/manifest/uv-lock-parser';

describe('uv-lock-parser', () => {
  describe('parseUvLock wheel parsing', () => {
    it('extracts wheel entries from packages', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "numpy"
version = "1.26.4"

[[package.wheels]]
url = "https://files.pythonhosted.org/numpy-1.26.4-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"

[[package.wheels]]
url = "https://files.pythonhosted.org/numpy-1.26.4-cp312-cp312-macosx_11_0_arm64.whl"
`;
      const lockFile = parseUvLock(lockContent);
      expect(lockFile.packages).toHaveLength(1);
      expect(lockFile.packages[0].wheels).toHaveLength(2);
      expect(lockFile.packages[0].wheels[0].url).toContain(
        'manylinux_2_17_x86_64'
      );
      expect(lockFile.packages[0].wheels[1].url).toContain('macosx_11_0_arm64');
    });

    it('returns empty wheels array when package has no wheels', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "my-sdist-only-pkg"
version = "1.0.0"
`;
      const lockFile = parseUvLock(lockContent);
      expect(lockFile.packages).toHaveLength(1);
      expect(lockFile.packages[0].wheels).toEqual([]);
    });

    it('handles packages with only sdist (no wheels section)', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "some-pkg"
version = "0.1.0"

[package.sdist]
url = "https://files.pythonhosted.org/some-pkg-0.1.0.tar.gz"
`;
      const lockFile = parseUvLock(lockContent);
      expect(lockFile.packages).toHaveLength(1);
      expect(lockFile.packages[0].wheels).toEqual([]);
    });

    it('handles mixed packages with and without wheels', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "requests"
version = "2.31.0"

[[package.wheels]]
url = "https://files.pythonhosted.org/requests-2.31.0-py3-none-any.whl"

[[package]]
name = "custom-pkg"
version = "0.1.0"
`;
      const lockFile = parseUvLock(lockContent);
      expect(lockFile.packages).toHaveLength(2);

      const requests = lockFile.packages.find(p => p.name === 'requests');
      expect(requests?.wheels).toHaveLength(1);
      expect(requests?.wheels[0].url).toContain('py3-none-any.whl');

      const customPkg = lockFile.packages.find(p => p.name === 'custom-pkg');
      expect(customPkg?.wheels).toEqual([]);
    });
  });
});
