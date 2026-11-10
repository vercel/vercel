import { describe, it, expect } from 'vitest';
import { parseUvLock } from '../src/manifest/uv-lock-parser';
import { evaluateMarker } from '../src/manifest/wheel-compat';

describe('uv-lock-parser', () => {
  describe('parseUvLock dependency marker parsing', () => {
    it('extracts marker field from dependencies', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "myapp"
version = "1.0.0"
dependencies = [
    { name = "requests" },
    { name = "pywin32", marker = "sys_platform == 'win32'" },
    { name = "colorama", marker = "os_name == 'nt'" },
]
`;
      const lockFile = parseUvLock(lockContent);
      expect(lockFile.packages).toHaveLength(1);
      const deps = lockFile.packages[0].dependencies!;
      expect(deps).toHaveLength(3);
      expect(deps[0]).toEqual({ name: 'requests' });
      expect(deps[1]).toEqual({
        name: 'pywin32',
        marker: "sys_platform == 'win32'",
      });
      expect(deps[2]).toEqual({
        name: 'colorama',
        marker: "os_name == 'nt'",
      });
    });
  });

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

  describe('evaluateMarker', () => {
    it('rejects win32-only markers on Linux', async () => {
      expect(
        await evaluateMarker(
          "sys_platform == 'win32'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(false);
    });

    it('accepts linux markers on Linux', async () => {
      expect(
        await evaluateMarker(
          "sys_platform == 'linux'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(true);
    });

    it('rejects os_name == nt on Linux', async () => {
      expect(
        await evaluateMarker("os_name == 'nt'", 3, 12, 'linux', 'x86_64')
      ).toBe(false);
    });

    it('accepts os_name == posix on Linux', async () => {
      expect(
        await evaluateMarker("os_name == 'posix'", 3, 12, 'linux', 'x86_64')
      ).toBe(true);
    });

    it('rejects platform_system == Windows on Linux', async () => {
      expect(
        await evaluateMarker(
          "platform_system == 'Windows'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(false);
    });

    it('accepts platform_system == Linux on Linux', async () => {
      expect(
        await evaluateMarker(
          "platform_system == 'Linux'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(true);
    });

    it('handles compound markers with and', async () => {
      // Both conditions must be true; sys_platform == 'win32' is false on Linux
      expect(
        await evaluateMarker(
          "python_version >= '3.12' and sys_platform == 'win32'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(false);
    });

    it('handles compound markers with or', async () => {
      // At least one condition must be true; sys_platform == 'linux' is true
      expect(
        await evaluateMarker(
          "sys_platform == 'win32' or sys_platform == 'linux'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(true);
    });

    it('accepts python version markers for matching version', async () => {
      expect(
        await evaluateMarker(
          "python_version >= '3.12'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(true);
    });

    it('rejects python version markers for non-matching version', async () => {
      expect(
        await evaluateMarker(
          "python_full_version < '3.12'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(false);
    });

    it('handles platform_machine markers', async () => {
      expect(
        await evaluateMarker(
          "platform_machine == 'x86_64'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(true);
      expect(
        await evaluateMarker(
          "platform_machine == 'aarch64'",
          3,
          12,
          'linux',
          'x86_64'
        )
      ).toBe(false);
    });

    it('evaluates markers for win32 target', async () => {
      expect(
        await evaluateMarker(
          "sys_platform == 'win32'",
          3,
          12,
          'win32',
          'x86_64'
        )
      ).toBe(true);
      expect(
        await evaluateMarker("os_name == 'nt'", 3, 12, 'win32', 'x86_64')
      ).toBe(true);
    });
  });
});
