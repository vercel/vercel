import { describe, it, expect } from 'vitest';
import {
  parseRequirementsFile,
  convertRequirementsToPyprojectToml,
} from '../src/manifest/requirements-txt-parser';

describe('parseRequirementsFile', () => {
  it('parses simple package names', async () => {
    const content = `
flask
requests
django
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask' },
      { name: 'requests' },
      { name: 'django' },
    ]);
  });

  it('parses packages with version specifiers', async () => {
    const content = `
flask>=2.0.0
requests==2.28.0
django>=4.0,<5.0
numpy~=1.24.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'django', version: '>=4.0, <5.0' },
      { name: 'numpy', version: '~=1.24.0' },
    ]);
  });

  it('parses packages with extras', async () => {
    const content = `
requests[socks]
uvicorn[standard]>=0.20.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'requests', extras: ['socks'] },
      { name: 'uvicorn', version: '>=0.20.0', extras: ['standard'] },
    ]);
  });

  it('parses packages with environment markers', async () => {
    const content = `
pywin32>=300 ; sys_platform == "win32"
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('pywin32');
    expect(result.requirements[0].version).toBe('>=300');
    expect(result.requirements[0].markers).toBeDefined();
  });

  it('parses packages with complex environment markers (multiple or clauses)', async () => {
    const content = `
greenlet==3.3.0 ; python_version == "3.12" and (platform_machine == "aarch64" or platform_machine == "ppc64le" or platform_machine == "x86_64" or platform_machine == "amd64" or platform_machine == "AMD64" or platform_machine == "win32" or platform_machine == "WIN32")
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'greenlet',
      version: '==3.3.0',
      markers:
        "(python_full_version == '3.12.*' and platform_machine == 'AMD64') or (python_full_version == '3.12.*' and platform_machine == 'WIN32') or (python_full_version == '3.12.*' and platform_machine == 'aarch64') or (python_full_version == '3.12.*' and platform_machine == 'amd64') or (python_full_version == '3.12.*' and platform_machine == 'ppc64le') or (python_full_version == '3.12.*' and platform_machine == 'win32') or (python_full_version == '3.12.*' and platform_machine == 'x86_64')",
    });
  });

  it('preserves hashes for packages with nested and/or environment markers', async () => {
    const content = `
greenlet==3.3.0 ; python_version == "3.12" and (platform_machine == "aarch64" or platform_machine == "ppc64le" or platform_machine == "x86_64" or platform_machine == "amd64" or platform_machine == "AMD64" or platform_machine == "win32" or platform_machine == "WIN32") --hash=sha256:abc123
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('greenlet');
    expect(result.requirements[0].version).toBe('==3.3.0');
    expect(result.requirements[0].markers).toContain('platform_machine');
    expect(result.requirements[0].hashes).toEqual(['sha256:abc123']);
  });

  it('still rejects invalid grouped environment markers', async () => {
    const content = `
greenlet==3.3.0 ; python_version == "3.12" and (platform_machine == "aarch64" or platform_machine == "ppc64le"
`;
    await expect(parseRequirementsFile(content)).rejects.toThrow();
  });

  it('parses URL-based requirements', async () => {
    const content = `
mypackage @ https://github.com/user/repo/archive/v1.0.0.zip
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      {
        name: 'mypackage',
        url: 'https://github.com/user/repo/archive/v1.0.0.zip',
      },
    ]);
  });

  it('skips comments and empty lines', async () => {
    const content = `
# This is a comment
flask>=2.0.0

# Another comment
requests==2.28.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('follows -r and -c directives via readFile', async () => {
    const content = `
flask>=2.0.0
-r other-requirements.txt
-c constraints.txt
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'other-requirements.txt') return 'numpy>=1.0\n';
      if (path === 'constraints.txt') return 'requests==2.28.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, { readFile });
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'numpy', version: '>=1.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('follows --requirement files via readFile', async () => {
    const content = `
flask>=2.0.0
--requirement other.txt
--requirement=another.txt
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'other.txt') return 'numpy>=1.0\n';
      if (path === 'another.txt') return 'scipy>=1.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, { readFile });
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'numpy', version: '>=1.0' },
      { name: 'scipy', version: '>=1.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('follows --constraint files via readFile', async () => {
    const content = `
flask>=2.0.0
--constraint constraints.txt
--constraint=more-constraints.txt
`;
    const readFile = (path: string) => {
      if (path === 'constraints.txt') return 'flask==2.0.0\n';
      if (path === 'more-constraints.txt') return 'requests==2.28.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, { readFile });
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('follows -r and -c short form directives via readFile', async () => {
    const content = `
flask>=2.0.0
-r other.txt
-c constraints.txt
`;
    const readFile = (path: string) => {
      if (path === 'other.txt') return 'numpy>=1.0\n';
      if (path === 'constraints.txt') return 'flask==2.0.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, { readFile });
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'numpy', version: '>=1.0' },
    ]);
  });

  it('rejects multiple --index-url values', async () => {
    const content = `
--index-url https://pypi.example.com/simple/
flask>=2.0.0
--index-url=https://pypi.other.com/simple/
`;
    await expect(parseRequirementsFile(content)).rejects.toThrow(
      /Multiple `--index-url` values provided/
    );
  });

  it('extracts -i short form for index-url', async () => {
    const content = `
-i https://pypi.example.com/simple/
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.indexUrl).toBe('https://pypi.example.com/simple/');
  });

  it('extracts --extra-index-url (collects all)', async () => {
    const content = `
--extra-index-url https://pypi.extra1.com/simple/
flask>=2.0.0
--extra-index-url=https://pypi.extra2.com/simple/
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.extraIndexUrls).toEqual([
      'https://pypi.extra1.com/simple/',
      'https://pypi.extra2.com/simple/',
    ]);
  });

  it('handles complex file with all pip options', async () => {
    const content = `
# Production requirements
--index-url https://pypi.org/simple/
--extra-index-url https://private.pypi.com/simple/

flask>=2.0.0
requests[socks]==2.28.0

# Include other files
--requirement base.txt
--constraint constraints.txt
-r dev.txt
-c version-locks.txt

django>=4.0
`;
    const readFile = (path: string) => {
      if (path === 'base.txt') return 'numpy>=1.0\n';
      if (path === 'dev.txt') return 'pytest>=7.0\n';
      if (path === 'constraints.txt') return 'flask==2.0.0\n';
      if (path === 'version-locks.txt') return 'requests==2.28.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, { readFile });

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0', extras: ['socks'] },
      { name: 'numpy', version: '>=1.0' },
      { name: 'pytest', version: '>=7.0' },
      { name: 'django', version: '>=4.0' },
    ]);

    expect(result.pipOptions.indexUrl).toBe('https://pypi.org/simple/');
    expect(result.pipOptions.extraIndexUrls).toEqual([
      'https://private.pypi.com/simple/',
    ]);
  });

  it('returns empty options when no pip arguments present', async () => {
    const content = `
flask>=2.0.0
requests==2.28.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions).toEqual({
      extraIndexUrls: [],
    });
  });

  it('handles empty file', async () => {
    const result = await parseRequirementsFile('');
    expect(result.requirements).toEqual([]);
    expect(result.pipOptions).toEqual({
      extraIndexUrls: [],
    });
  });

  it('handles file with only comments', async () => {
    const content = `
# This is a comment
# Another comment
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([]);
    expect(result.pipOptions).toEqual({
      extraIndexUrls: [],
    });
  });

  it('extracts --hash from requirements', async () => {
    const content = `
flask==2.0.0 --hash=sha256:abc123def456
requests==2.28.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0]).toEqual({
      name: 'flask',
      version: '==2.0.0',
      hashes: ['sha256:abc123def456'],
    });
    expect(result.requirements[1]).toEqual({
      name: 'requests',
      version: '==2.28.0',
    });
  });

  it('extracts multiple --hash values for a single requirement', async () => {
    const content = `
flask==2.0.0 --hash=sha256:abc123 --hash=sha256:def456 --hash=sha384:ghi789
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'flask',
      version: '==2.0.0',
      hashes: ['sha256:abc123', 'sha256:def456', 'sha384:ghi789'],
    });
  });

  it('handles --hash with line continuations', async () => {
    const content = `
flask==2.0.0 \\
    --hash=sha256:abc123 \\
    --hash=sha256:def456
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'flask',
      version: '==2.0.0',
      hashes: ['sha256:abc123', 'sha256:def456'],
    });
  });

  it('handles requirements with both extras and --hash', async () => {
    const content = `
uvicorn[standard]==0.20.0 --hash=sha256:abc123
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'uvicorn',
      version: '==0.20.0',
      extras: ['standard'],
      hashes: ['sha256:abc123'],
    });
  });

  it('handles complex file with hashes and other pip options', async () => {
    const content = `
--index-url https://pypi.org/simple/
flask==2.0.0 --hash=sha256:flask_hash
requests==2.28.0 --hash=sha256:req_hash1 --hash=sha256:req_hash2
-r other.txt
django>=4.0
`;
    const readFile = (path: string) => {
      if (path === 'other.txt') return 'numpy>=1.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, { readFile });

    expect(result.requirements).toEqual([
      { name: 'flask', version: '==2.0.0', hashes: ['sha256:flask_hash'] },
      {
        name: 'requests',
        version: '==2.28.0',
        hashes: ['sha256:req_hash1', 'sha256:req_hash2'],
      },
      { name: 'numpy', version: '>=1.0' },
      { name: 'django', version: '>=4.0' },
    ]);
    expect(result.pipOptions.indexUrl).toBe('https://pypi.org/simple/');
  });
});

describe('parseRequirementsFile with readFile', () => {
  it('follows -r references and merges requirements inline', async () => {
    const mainContent = `
flask>=2.0.0
-r base.txt
django>=4.0
`;
    const baseContent = `
requests==2.28.0
numpy>=1.24.0
`;
    const readFile = (path: string) => {
      if (path === 'base.txt') return baseContent;
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });

    // Upstream inserts included requirements inline at the -r position
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'numpy', version: '>=1.24.0' },
      { name: 'django', version: '>=4.0' },
    ]);
  });

  it('follows --requirement references', async () => {
    const mainContent = `
flask>=2.0.0
--requirement deps.txt
`;
    const depsContent = `
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'deps.txt') return depsContent;
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('handles nested requirement files', async () => {
    const mainContent = `
flask>=2.0.0
-r level1.txt
`;
    const level1Content = `
requests==2.28.0
-r level2.txt
`;
    const level2Content = `
numpy>=1.24.0
`;
    const readFile = (path: string) => {
      if (path === 'level1.txt') return level1Content;
      if (path === 'level2.txt') return level2Content;
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'numpy', version: '>=1.24.0' },
    ]);
  });

  it('prevents circular references', async () => {
    const fileA = `
flask>=2.0.0
-r b.txt
`;
    const fileB = `
requests==2.28.0
-r a.txt
`;
    const readFile = (path: string) => {
      if (path === 'a.txt') return fileA;
      if (path === 'b.txt') return fileB;
      return null;
    };

    // Upstream detects circular references (a.txt re-included is a no-op
    // because the cache already has its path, but the requirements from the
    // second traversal of a.txt appear in the result).
    const result = await parseRequirementsFile(fileA, { readFile });
    // Should not hang; just verify it terminates and includes both packages
    expect(result.requirements.map(r => r.name)).toContain('flask');
    expect(result.requirements.map(r => r.name)).toContain('requests');
  });

  it('prevents circular references with normalized paths', async () => {
    const fileA = `
flask>=2.0.0
-r ./b.txt
`;
    const fileB = `
requests==2.28.0
-r ./a.txt
`;
    const readFile = (path: string) => {
      // Paths are normalized by the host-bridge before calling readFile
      // (e.g. ./b.txt → b.txt after workingDir stripping and normalization)
      if (path === 'b.txt') return fileB;
      if (path === 'a.txt') return fileA;
      return null;
    };

    // Should not hang or throw even with different path forms referencing same files
    const result = await parseRequirementsFile(fileA, { readFile });
    expect(result.requirements.map(r => r.name)).toContain('flask');
    expect(result.requirements.map(r => r.name)).toContain('requests');
  });

  it('includes duplicate requirements from referenced files', async () => {
    const mainContent = `
flask>=2.0.0
requests>=2.0.0
-r deps.txt
`;
    const depsContent = `
requests==2.28.0
django>=4.0
`;
    const readFile = (path: string) => {
      if (path === 'deps.txt') return depsContent;
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });

    // Upstream includes all requirements inline (does not deduplicate)
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'django', version: '>=4.0' },
    ]);
  });

  it('merges pip options from referenced files', async () => {
    const mainContent = `
--index-url https://main.pypi.org/simple/
flask>=2.0.0
-r deps.txt
`;
    const depsContent = `
--extra-index-url https://extra.pypi.org/simple/
-c constraints.txt
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'deps.txt') return depsContent;
      if (path === 'constraints.txt') return 'flask==2.0.0\n';
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });

    expect(result.pipOptions.indexUrl).toBe('https://main.pypi.org/simple/');
    expect(result.pipOptions.extraIndexUrls).toContain(
      'https://extra.pypi.org/simple/'
    );
  });

  it('later index-url from referenced file takes precedence', async () => {
    const mainContent = `
flask>=2.0.0
-r deps.txt
`;
    const depsContent = `
--index-url https://deps.pypi.org/simple/
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'deps.txt') return depsContent;
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });

    expect(result.pipOptions.indexUrl).toBe('https://deps.pypi.org/simple/');
  });

  it('handles missing referenced files gracefully', async () => {
    const mainContent = `
flask>=2.0.0
-r missing.txt
django>=4.0
`;
    const readFile = () => null;

    // Upstream errors when included file cannot be read
    await expect(
      parseRequirementsFile(mainContent, { readFile })
    ).rejects.toThrow();
  });
});

describe('convertRequirementsToPyprojectToml', () => {
  it('converts simple requirements to pyproject.toml', async () => {
    const content = `
flask>=2.0.0
requests==2.28.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['flask>=2.0.0', 'requests==2.28.0'],
      },
    });
  });

  it('converts requirements with extras', async () => {
    const content = `
uvicorn[standard]>=0.20.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['uvicorn[standard]>=0.20.0'],
      },
    });
  });

  it('converts URL-based requirements', async () => {
    const content = `
mypackage @ https://example.com/package.zip
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['mypackage @ https://example.com/package.zip'],
      },
    });
  });

  it('returns empty object for empty requirements', async () => {
    const result = await convertRequirementsToPyprojectToml('');
    expect(result).toEqual({});
  });

  it('converts pip arguments when converting with readFile for -r', async () => {
    const content = `
flask>=2.0.0
--index-url https://pypi.org/simple/
--requirement other.txt
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'other.txt') return 'numpy>=1.0\n';
      return null;
    };
    const result = await convertRequirementsToPyprojectToml(content, {
      readFile,
    });
    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['flask>=2.0.0', 'numpy>=1.0', 'requests==2.28.0'],
      },
      tool: {
        uv: {
          index: [
            {
              name: 'primary',
              url: 'https://pypi.org/simple/',
              default: true,
            },
          ],
        },
      },
    });
  });

  it('handles requirements with environment markers', async () => {
    const content = `
pywin32>=300 ; sys_platform == "win32"
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toHaveLength(1);
    expect(result.project?.dependencies?.[0]).toContain('pywin32');
    expect(result.project?.dependencies?.[0]).toContain('>=300');
    expect(result.project?.dependencies?.[0]).toContain(';');
  });

  it('converts nested and/or environment markers without parse errors', async () => {
    const content = `
greenlet==3.3.0 ; python_version == "3.12" and (platform_machine == "aarch64" or platform_machine == "ppc64le" or platform_machine == "x86_64" or platform_machine == "amd64" or platform_machine == "AMD64" or platform_machine == "win32" or platform_machine == "WIN32")
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual([
      "greenlet==3.3.0 ; (python_full_version == '3.12.*' and platform_machine == 'AMD64') or (python_full_version == '3.12.*' and platform_machine == 'WIN32') or (python_full_version == '3.12.*' and platform_machine == 'aarch64') or (python_full_version == '3.12.*' and platform_machine == 'amd64') or (python_full_version == '3.12.*' and platform_machine == 'ppc64le') or (python_full_version == '3.12.*' and platform_machine == 'win32') or (python_full_version == '3.12.*' and platform_machine == 'x86_64')",
    ]);
  });

  it('strips --hash when converting to pyproject.toml', async () => {
    const content = `
flask==2.0.0 --hash=sha256:abc123
requests==2.28.0 --hash=sha256:def456 --hash=sha256:ghi789
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['flask==2.0.0', 'requests==2.28.0'],
      },
    });
  });

  it('follows -r references when readFile is provided', async () => {
    const mainContent = `
flask>=2.0.0
-r deps.txt
`;
    const depsContent = `
requests==2.28.0
django>=4.0
`;
    const readFile = (path: string) => {
      if (path === 'deps.txt') return depsContent;
      return null;
    };

    const result = await convertRequirementsToPyprojectToml(mainContent, {
      readFile,
    });

    // Upstream inserts inline at -r position
    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['flask>=2.0.0', 'requests==2.28.0', 'django>=4.0'],
      },
    });
  });

  it('handles nested -r references', async () => {
    const mainContent = `
flask>=2.0.0
-r base.txt
`;
    const baseContent = `
requests==2.28.0
-r common.txt
`;
    const commonContent = `
numpy>=1.24.0
`;
    const readFile = (path: string) => {
      if (path === 'base.txt') return baseContent;
      if (path === 'common.txt') return commonContent;
      return null;
    };

    const result = await convertRequirementsToPyprojectToml(mainContent, {
      readFile,
    });

    expect(result).toEqual({
      project: {
        name: 'app',
        version: '0.1.0',
        dependencies: ['flask>=2.0.0', 'requests==2.28.0', 'numpy>=1.24.0'],
      },
    });
  });

  it('parses git URL dependencies', async () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git@v1.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('mypackage');
    expect(result.requirements[0].url).toBe(
      'git+https://github.com/user/repo.git@v1.0.0'
    );
    expect(result.requirements[0].source).toEqual({
      git: 'https://github.com/user/repo.git',
      rev: 'v1.0.0',
    });
  });

  it('parses git URL with branch ref', async () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git@main
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements[0].source).toEqual({
      git: 'https://github.com/user/repo.git',
      rev: 'main',
    });
  });

  it('parses git URL without ref', async () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements[0].source).toEqual({
      git: 'https://github.com/user/repo.git',
    });
  });

  it('parses git+ssh URL', async () => {
    const content = `
mypackage @ git+ssh://git@github.com/user/repo.git@v2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements[0].source).toEqual({
      git: 'ssh://git@github.com/user/repo.git',
      rev: 'v2.0.0',
    });
  });

  it('converts git URL dependencies to pyproject.toml with sources', async () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git@v1.0.0
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual([
      'mypackage @ git+https://github.com/user/repo.git@v1.0.0',
      'flask>=2.0.0',
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
          rev: 'v1.0.0',
        },
      ],
    });
  });

  it('handles multiple git dependencies', async () => {
    const content = `
package1 @ git+https://github.com/user/repo1.git@v1.0.0
package2 @ git+https://github.com/user/repo2.git@main
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.tool?.uv?.sources).toEqual({
      package1: [
        {
          git: 'https://github.com/user/repo1.git',
          rev: 'v1.0.0',
        },
      ],
      package2: [
        {
          git: 'https://github.com/user/repo2.git',
          rev: 'main',
        },
      ],
    });
  });

  it('converts --index-url to tool.uv.index', async () => {
    const content = `
--index-url https://private.pypi.org/simple/
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual(['flask>=2.0.0']);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
    ]);
  });

  it('converts --extra-index-url to tool.uv.index', async () => {
    const content = `
--extra-index-url https://extra1.pypi.org/simple/
--extra-index-url https://extra2.pypi.org/simple/
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual(['flask>=2.0.0']);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'extra-1',
        url: 'https://extra1.pypi.org/simple/',
      },
      {
        name: 'extra-2',
        url: 'https://extra2.pypi.org/simple/',
      },
    ]);
  });

  it('converts both --index-url and --extra-index-url to tool.uv.index', async () => {
    const content = `
--index-url https://private.pypi.org/simple/
--extra-index-url https://extra.pypi.org/simple/
flask>=2.0.0
requests>=2.28.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual([
      'flask>=2.0.0',
      'requests>=2.28.0',
    ]);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
      {
        name: 'extra-1',
        url: 'https://extra.pypi.org/simple/',
      },
    ]);
  });

  it('converts -i short form to tool.uv.index', async () => {
    const content = `
-i https://private.pypi.org/simple/
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
    ]);
  });

  it('combines git sources and index URLs in tool.uv', async () => {
    const content = `
--index-url https://private.pypi.org/simple/
mypackage @ git+https://github.com/user/repo.git@v1.0.0
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual([
      'mypackage @ git+https://github.com/user/repo.git@v1.0.0',
      'flask>=2.0.0',
    ]);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
          rev: 'v1.0.0',
        },
      ],
    });
  });

  it('does not include tool.uv when no index URLs or sources', async () => {
    const content = `
flask>=2.0.0
requests>=2.28.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual([
      'flask>=2.0.0',
      'requests>=2.28.0',
    ]);
    expect(result.tool).toBeUndefined();
  });
});

describe('parseRequirementsFile with bare paths and URLs', () => {
  it('parses relative wheel file paths', async () => {
    const content = `
./wheels/example_pkg_one-1.0.0-py3-none-any.whl
./wheels/example_pkg_two-2.0.0-py3-none-any.whl
fastapi
uvicorn
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'example-pkg-one',
        version: '==1.0.0',
        source: { path: './wheels/example_pkg_one-1.0.0-py3-none-any.whl' },
      },
      {
        name: 'example-pkg-two',
        version: '==2.0.0',
        source: { path: './wheels/example_pkg_two-2.0.0-py3-none-any.whl' },
      },
      { name: 'fastapi' },
      { name: 'uvicorn' },
    ]);
  });

  it('parses absolute wheel file paths', async () => {
    const content = `
/opt/wheels/my_package-3.2.1-cp311-cp311-linux_x86_64.whl
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my-package',
        version: '==3.2.1',
        source: {
          path: '/opt/wheels/my_package-3.2.1-cp311-cp311-linux_x86_64.whl',
        },
      },
    ]);
  });

  it('parses parent-relative paths', async () => {
    const content = `
../shared/wheels/pkg-1.0.0-py3-none-any.whl
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'pkg',
        version: '==1.0.0',
        source: { path: '../shared/wheels/pkg-1.0.0-py3-none-any.whl' },
      },
    ]);
  });

  it('parses sdist archive paths', async () => {
    const content = `
./vendor/my-cool-package-2.1.0.tar.gz
./vendor/another-pkg-0.5.zip
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my-cool-package',
        version: '==2.1.0',
        source: { path: './vendor/my-cool-package-2.1.0.tar.gz' },
      },
      {
        name: 'another-pkg',
        version: '==0.5',
        source: { path: './vendor/another-pkg-0.5.zip' },
      },
    ]);
  });

  it('parses bare HTTP/HTTPS URLs', async () => {
    const content = `
https://example.com/packages/my_pkg-1.0.0-py3-none-any.whl
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my-pkg',
        version: '==1.0.0',
        url: 'https://example.com/packages/my_pkg-1.0.0-py3-none-any.whl',
      },
    ]);
  });

  it('parses file:// URLs', async () => {
    const content = `
file:///opt/wheels/pkg-2.0.0-py3-none-any.whl
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'pkg',
        version: '==2.0.0',
        source: { path: '/opt/wheels/pkg-2.0.0-py3-none-any.whl' },
      },
    ]);
  });

  it('parses directory paths using last component as name', async () => {
    const content = `
./test/packages/black_editable
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'black_editable',
        source: { path: './test/packages/black_editable' },
      },
    ]);
  });

  it('parses directory paths with extras', async () => {
    const content = `
./test/packages/black_editable[dev]
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'black_editable',
        extras: ['dev'],
        source: { path: './test/packages/black_editable' },
      },
    ]);
  });

  it('parses path requirements with environment markers', async () => {
    const content = `
./test/packages/my_pkg ; python_version >= "3.9"
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my_pkg',
        markers: "python_full_version >= '3.9'",
        source: { path: './test/packages/my_pkg' },
      },
    ]);
  });

  it('parses path requirements with inline comments', async () => {
    const content = `
./test/packages/my_pkg # this is a comment
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my_pkg',
        source: { path: './test/packages/my_pkg' },
      },
    ]);
  });

  it('handles wheel paths with build tags', async () => {
    const content = `
./wheels/pkg-1.0.0-1-py3-none-any.whl
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'pkg',
        version: '==1.0.0',
        source: { path: './wheels/pkg-1.0.0-1-py3-none-any.whl' },
      },
    ]);
  });

  it('converts wheel path requirements to pyproject.toml with sources', async () => {
    const content = `
./wheels/example_pkg_one-1.0.0-py3-none-any.whl
./wheels/example_pkg_two-2.0.0-py3-none-any.whl
fastapi
uvicorn
`;
    const result = await convertRequirementsToPyprojectToml(content, {
      workingDir: '/project',
    });
    expect(result.project?.dependencies).toEqual([
      'example-pkg-one==1.0.0',
      'example-pkg-two==2.0.0',
      'fastapi',
      'uvicorn',
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      'example-pkg-one': [
        { path: './wheels/example_pkg_one-1.0.0-py3-none-any.whl' },
      ],
      'example-pkg-two': [
        { path: './wheels/example_pkg_two-2.0.0-py3-none-any.whl' },
      ],
    });
  });

  it('converts directory path requirements to pyproject.toml with sources', async () => {
    const content = `
./packages/my_local_pkg
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content, {
      workingDir: '/project',
    });
    expect(result.project?.dependencies).toEqual([
      'my_local_pkg',
      'flask>=2.0.0',
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      my_local_pkg: [{ path: './packages/my_local_pkg' }],
    });
  });

  it('converts bare URL requirements to pyproject.toml', async () => {
    const content = `
https://example.com/my_pkg-1.0.0-py3-none-any.whl
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content, {
      workingDir: '/project',
    });
    // PEP 508 URL requirements use name @ url (version is implicit in the URL)
    expect(result.project?.dependencies).toEqual([
      'my-pkg @ https://example.com/my_pkg-1.0.0-py3-none-any.whl',
      'flask>=2.0.0',
    ]);
  });

  it('rebases paths when packageRoot differs from workingDir', async () => {
    const content = `
./wheels/pkg-1.0.0-py3-none-any.whl
-e ./my-local-pkg
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content, {
      workingDir: '/project/subdir',
      packageRoot: '/project',
    });
    expect(result.project?.dependencies).toEqual([
      'pkg==1.0.0',
      'flask>=2.0.0',
      'my-local-pkg',
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      pkg: [{ path: './subdir/wheels/pkg-1.0.0-py3-none-any.whl' }],
      'my-local-pkg': [{ path: './subdir/my-local-pkg', editable: true }],
    });
  });
});

describe('parseRequirementsFile with editable requirements', () => {
  it('parses -e with directory path', async () => {
    const content = `
-e ./my-package
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      {
        name: 'my-package',
        source: { path: './my-package', editable: true },
      },
    ]);
  });

  it('parses -e with extras', async () => {
    const content = `
-e ./editable[d,dev]
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'editable',
        extras: ['d', 'dev'],
        source: { path: './editable', editable: true },
      },
    ]);
  });

  it('parses -e with extras and whitespace (uv-compatible)', async () => {
    const content = `
-e ./editable[d, dev]
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'editable',
        extras: ['d', 'dev'],
        source: { path: './editable', editable: true },
      },
    ]);
  });

  it('parses -e with environment markers', async () => {
    const content = `
-e ./editable[d,dev] ; python_version >= "3.9" and os_name == "posix"
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'editable',
        extras: ['d', 'dev'],
        markers: "python_full_version >= '3.9' and os_name == 'posix'",
        source: { path: './editable', editable: true },
      },
    ]);
  });

  it('parses -e with inline comment', async () => {
    const content = `
-e ./editable # comment
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'editable',
        source: { path: './editable', editable: true },
      },
    ]);
  });

  it('parses --editable long form', async () => {
    const content = `
--editable ./my-package
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my-package',
        source: { path: './my-package', editable: true },
      },
    ]);
  });

  it('parses --editable=path form', async () => {
    const content = `
--editable=./my-package
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my-package',
        source: { path: './my-package', editable: true },
      },
    ]);
  });

  it('rejects -e with wheel file (upstream behavior)', async () => {
    const content = `
-e ./wheels/pkg-1.0.0-py3-none-any.whl
`;
    await expect(
      parseRequirementsFile(content, {
        workingDir: '/project',
      })
    ).rejects.toThrow(/Unsupported editable requirement/);
  });

  it('converts editable to pyproject.toml with editable source', async () => {
    const content = `
-e ./my-package
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content, {
      workingDir: '/project',
    });
    expect(result.project?.dependencies).toEqual([
      'flask>=2.0.0',
      'my-package',
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      'my-package': [{ path: './my-package', editable: true }],
    });
  });
});

describe('parseRequirementsFile with bare archive filenames', () => {
  it('parses bare wheel filename (no path prefix)', async () => {
    const content = `
importlib_metadata-8.3.0-py3-none-any.whl
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'importlib-metadata',
        version: '==8.3.0',
        source: { path: 'importlib_metadata-8.3.0-py3-none-any.whl' },
      },
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('parses bare wheel with extras', async () => {
    const content = `
importlib_metadata-8.2.0-py3-none-any.whl[extra]
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'importlib-metadata',
        version: '==8.2.0',
        extras: ['extra'],
        source: { path: 'importlib_metadata-8.2.0-py3-none-any.whl' },
      },
    ]);
  });

  it('parses bare wheel with markers', async () => {
    const content = `
importlib_metadata-8.2.0-py3-none-any.whl ; sys_platform == 'win32'
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'importlib-metadata',
        version: '==8.2.0',
        markers: "sys_platform == 'win32'",
        source: { path: 'importlib_metadata-8.2.0-py3-none-any.whl' },
      },
    ]);
  });

  it('parses bare sdist filename', async () => {
    const content = `
my-package-1.0.0.tar.gz
`;
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
    });
    expect(result.requirements).toEqual([
      {
        name: 'my-package',
        version: '==1.0.0',
        source: { path: 'my-package-1.0.0.tar.gz' },
      },
    ]);
  });

  it('does not catch PEP 508 name @ url.zip as bare archive', async () => {
    const content = `
mypackage @ https://github.com/user/repo/archive/v1.0.0.zip
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      {
        name: 'mypackage',
        url: 'https://github.com/user/repo/archive/v1.0.0.zip',
      },
    ]);
  });
});

describe('parseRequirementsFile with find-links and no-index', () => {
  it('extracts --find-links with URL', async () => {
    const content = `
--find-links https://example.com/wheels/
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/wheels/',
    ]);
  });

  it('extracts --find-links=<url> form', async () => {
    const content = `
--find-links=https://example.com/packages/
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/packages/',
    ]);
  });

  it('extracts -f short form', async () => {
    const content = `
-f https://example.com/packages/
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/packages/',
    ]);
  });

  it('collects multiple --find-links', async () => {
    const content = `
--find-links https://example.com/wheels/
--find-links=https://example.com/packages/
-f https://example.com/extra/
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/wheels/',
      'https://example.com/packages/',
      'https://example.com/extra/',
    ]);
  });

  it('extracts --no-index', async () => {
    const content = `
--no-index
--find-links https://example.com/wheels/
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.noIndex).toBe(true);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/wheels/',
    ]);
  });

  it('converts --find-links to flat index entries in pyproject.toml', async () => {
    const content = `
--find-links https://example.com/wheels/
--find-links https://example.com/packages/
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual(['flask>=2.0.0']);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'find-links-1',
        url: 'https://example.com/wheels/',
        format: 'flat',
      },
      {
        name: 'find-links-2',
        url: 'https://example.com/packages/',
        format: 'flat',
      },
    ]);
  });

  it('converts --find-links alongside --index-url to pyproject.toml', async () => {
    const content = `
--index-url https://private.pypi.org/simple/
--find-links https://example.com/wheels/
flask>=2.0.0
`;
    const result = await convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual(['flask>=2.0.0']);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
      {
        name: 'find-links-1',
        url: 'https://example.com/wheels/',
        format: 'flat',
      },
    ]);
  });

  it('merges find-links from referenced files', async () => {
    const mainContent = `
--find-links https://example.com/main-wheels/
flask>=2.0.0
-r deps.txt
`;
    const depsContent = `
--find-links https://example.com/dep-wheels/
requests==2.28.0
`;
    const readFile = (path: string) => {
      if (path === 'deps.txt') return depsContent;
      return null;
    };

    const result = await parseRequirementsFile(mainContent, { readFile });
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/main-wheels/',
      'https://example.com/dep-wheels/',
    ]);
  });
});

describe('parseRequirementsFile with unknown options', () => {
  it('strips --no-binary without crashing', async () => {
    const content = `
--no-binary :all:
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('strips --only-binary without crashing', async () => {
    const content = `
--only-binary flask
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('strips --pre without crashing', async () => {
    const content = `
--pre
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('strips --trusted-host without crashing', async () => {
    const content = `
--trusted-host pypi.example.com
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('strips --prefer-binary without crashing', async () => {
    const content = `
--prefer-binary
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
  });

  it('strips --require-hashes without crashing', async () => {
    const content = `
--require-hashes
flask==2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '==2.0.0' },
    ]);
  });

  it('handles complex file with many options', async () => {
    const content = `
# Production requirements
--index-url https://pypi.org/simple/
--extra-index-url https://private.pypi.com/simple/
--no-binary :all:
--trusted-host private.pypi.com
--prefer-binary
--find-links https://example.com/wheels/
--no-index

flask>=2.0.0
requests[socks]==2.28.0
-e ./my-local-package[dev]
./wheels/custom_pkg-1.0.0-py3-none-any.whl
custom_bare-2.0.0-py3-none-any.whl

# Include other files
-r dev.txt
-c version-locks.txt

django>=4.0
`;
    const readFile = (path: string) => {
      if (path === 'dev.txt') return 'pytest>=7.0\n';
      if (path === 'version-locks.txt') return 'flask==2.0.0\n';
      return null;
    };
    const result = await parseRequirementsFile(content, {
      workingDir: '/project',
      readFile,
    });

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0', extras: ['socks'] },
      {
        name: 'custom-pkg',
        version: '==1.0.0',
        source: { path: './wheels/custom_pkg-1.0.0-py3-none-any.whl' },
      },
      {
        name: 'custom-bare',
        version: '==2.0.0',
        source: { path: 'custom_bare-2.0.0-py3-none-any.whl' },
      },
      { name: 'pytest', version: '>=7.0' },
      { name: 'django', version: '>=4.0' },
      {
        name: 'my-local-package',
        extras: ['dev'],
        source: { path: './my-local-package', editable: true },
      },
    ]);

    expect(result.pipOptions.indexUrl).toBe('https://pypi.org/simple/');
    expect(result.pipOptions.extraIndexUrls).toEqual([
      'https://private.pypi.com/simple/',
    ]);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/wheels/',
    ]);
    expect(result.pipOptions.noIndex).toBe(true);
  });
});

describe('inline comment stripping on option values', () => {
  it('strips comments from --index-url value', async () => {
    const content = `
--index-url https://pypi.org/simple/ # main index
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.indexUrl).toBe('https://pypi.org/simple/');
  });

  it('strips comments from --extra-index-url value', async () => {
    const content = `
--extra-index-url https://private.pypi.com/simple/ # private
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.extraIndexUrls).toEqual([
      'https://private.pypi.com/simple/',
    ]);
  });

  it('strips comments from --find-links value', async () => {
    const content = `
--find-links https://example.com/wheels/ # local wheels
flask>=2.0.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.pipOptions.findLinks).toEqual([
      'https://example.com/wheels/',
    ]);
  });
});

describe('complex environment markers (WASM parser)', () => {
  it('handles nested and/or with multiple parenthesized groups', async () => {
    const content = `
cffi==1.16.0 ; (python_version >= "3.8" and python_version < "4") and (platform_machine == "x86_64" or platform_machine == "aarch64")
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('cffi');
    expect(result.requirements[0].version).toBe('==1.16.0');
    expect(result.requirements[0].markers).toBeDefined();
    expect(result.requirements[0].markers).toContain('python_full_version');
    expect(result.requirements[0].markers).toContain('platform_machine');
  });

  it('handles deeply nested marker expressions', async () => {
    const content = `
pywin32>=300 ; sys_platform == "win32" and (python_version >= "3.9" or (python_version >= "3.8" and platform_machine == "AMD64"))
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('pywin32');
    expect(result.requirements[0].markers).toBeDefined();
    expect(result.requirements[0].markers).toContain('sys_platform');
  });

  it('handles markers with "in" and "not in" operators', async () => {
    const content = `
colorama==0.4.6 ; platform_system == "Windows" or os_name == "nt"
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('colorama');
    expect(result.requirements[0].markers).toBeDefined();
  });

  it('handles top-level or in markers', async () => {
    const content = `
typing-extensions>=4.0 ; python_version < "3.11" or python_version >= "4.0"
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('typing-extensions');
    expect(result.requirements[0].version).toBe('>=4.0');
    expect(result.requirements[0].markers).toContain('or');
  });

  it('handles many or clauses in markers (pip-compile style)', async () => {
    // This is the pattern that crashed pip-requirements-js
    const content = `
grpcio==1.60.0 ; python_version >= "3.12" and (platform_machine == "aarch64" or platform_machine == "ppc64le" or platform_machine == "x86_64" or platform_machine == "amd64" or platform_machine == "AMD64" or platform_machine == "win32" or platform_machine == "WIN32" or platform_machine == "s390x")
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('grpcio');
    expect(result.requirements[0].version).toBe('==1.60.0');
    expect(result.requirements[0].markers).toContain('platform_machine');
    expect(result.requirements[0].markers).toContain('s390x');
  });
});

describe('hashes with markers and line continuations (WASM parser)', () => {
  it('handles hash with space separator (--hash sha256:...)', async () => {
    const content = `urllib3==1.26.15 \\
    --hash=sha256:8a388717b9476f934a21484e8c8e61875ab60644d29b9b39e11e4b9dc1c6b305
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('urllib3');
    expect(result.requirements[0].version).toBe('==1.26.15');
    expect(result.requirements[0].hashes).toEqual([
      'sha256:8a388717b9476f934a21484e8c8e61875ab60644d29b9b39e11e4b9dc1c6b305',
    ]);
  });

  it('handles markers combined with hashes', async () => {
    const content = `werkzeug==2.2.3 ; python_version >= "3.8" and python_version < "4.0" --hash=sha256:2e1ccc9417d4da358b9de6f174e3ac094391ea1d4fbef2d667865d819dfd0afe
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('werkzeug');
    expect(result.requirements[0].version).toBe('==2.2.3');
    expect(result.requirements[0].markers).toBeDefined();
    expect(result.requirements[0].markers).toContain('python_full_version');
    expect(result.requirements[0].hashes).toEqual([
      'sha256:2e1ccc9417d4da358b9de6f174e3ac094391ea1d4fbef2d667865d819dfd0afe',
    ]);
  });

  it('handles markers + multiple hashes + line continuations (poetry style)', async () => {
    const content = `psycopg2==2.9.5 ; python_version >= "3.8" and python_version < "4.0" \\
    --hash=sha256:093e3894d2d3c592ab0945d9eba9d139c139664dcf83a1c440b8a7aa9bb21955 \\
    --hash=sha256:190d51e8c1b25a47484e52a79638a8182451d6f6dff99f26ad9bd81e5359a0fa \\
    --hash=sha256:1a5c7d7d577e0eabfcf15eb87d1e19314c8c4f0e722a301f98e0e3a65e238b4e \\
    --hash=sha256:1e5a38aa85bd660c53947bd28aeaafb6a97d70423606f1ccb044a03a1203fe4a
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('psycopg2');
    expect(result.requirements[0].version).toBe('==2.9.5');
    expect(result.requirements[0].markers).toContain('python_full_version');
    expect(result.requirements[0].hashes).toHaveLength(4);
  });
});

describe('whitespace edge cases (WASM parser)', () => {
  it('handles leading whitespace before package name', async () => {
    const content = `
   numpy
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('numpy');
  });

  it('handles trailing whitespace after package name', async () => {
    const content = `numpy   \nrequests   \n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0].name).toBe('numpy');
    expect(result.requirements[1].name).toBe('requests');
  });

  it('handles inline comment after whitespace', async () => {
    const content = `numpy  #  comment\n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('numpy');
  });

  it('handles blank continuation line', async () => {
    // The WASM (uv) parser does not allow trailing backslash followed by blank line
    const content = `flask>=2.0.0 \\\n\nrequests==1.0.0\n`;
    await expect(parseRequirementsFile(content)).rejects.toThrow();
  });

  it('handles CRLF line endings', async () => {
    const content = `flask>=2.0.0\r\nrequests==1.0.0\r\n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0].name).toBe('flask');
    expect(result.requirements[1].name).toBe('requests');
  });
});

describe('version specifier edge cases (WASM parser)', () => {
  it('handles !== (arbitrary equality)', async () => {
    const content = `package===1.0.0.post1\n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('package');
    expect(result.requirements[0].version).toBe('===1.0.0.post1');
  });

  it('handles != (not-equal)', async () => {
    const content = `flask!=2.0.0\n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('flask');
    expect(result.requirements[0].version).toBe('!=2.0.0');
  });

  it('handles complex compound version specifiers', async () => {
    const content = `numpy>=1.20,!=1.24.0,!=1.24.1,<2.0\n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('numpy');
    expect(result.requirements[0].version).toContain('!=1.24.0');
    expect(result.requirements[0].version).toContain('!=1.24.1');
  });

  it('handles pre-release version specifiers', async () => {
    const content = `torch==2.1.0a0+cu121\n`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('torch');
  });
});

describe('pip-compile / real-world output (WASM parser)', () => {
  it('handles a full pip-compile output block', async () => {
    const content = `#
# This file is autogenerated by pip-compile with Python 3.12
# by the following command:
#
#    pip-compile requirements.in
#
certifi==2024.2.2
    # via requests
charset-normalizer==3.3.2
    # via requests
idna==3.6
    # via requests
requests==2.31.0
    # via -r requirements.in
urllib3==2.2.1
    # via requests
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(5);
    expect(result.requirements.map(r => r.name)).toEqual([
      'certifi',
      'charset-normalizer',
      'idna',
      'requests',
      'urllib3',
    ]);
    // pip-compile indented comments should be treated as comments
    expect(result.requirements[0].version).toBe('==2024.2.2');
  });

  it('handles pip-compile output with markers and hashes', async () => {
    const content = `werkzeug==2.2.3 ; python_version >= "3.8" and python_version < "4.0" \\
    --hash=sha256:2e1ccc9417d4da358b9de6f174e3ac094391ea1d4fbef2d667865d819dfd0afe
ansicon==1.89.0 ; python_version >= "3.8" and python_version < "4" and platform_system == "Windows" \\
    --hash=sha256:e4d039def5768a47e4afec8e89e83ec3ae5a26bf00ad851f914d1240b444d2b1
requests-oauthlib==1.3.1 ; python_version >= "3.8" and python_version < "4.0" \\
    --hash=sha256:2577c501a2fb8d05a304c09d090d6e47c306fef15809d102b327cf8364bddab5 \\
    --hash=sha256:75beac4a47881eeb94d5ea5d6ad31ef88856affe2332b9aafb52c6452ccf0d7a
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(3);

    // werkzeug: markers + 1 hash
    expect(result.requirements[0].name).toBe('werkzeug');
    expect(result.requirements[0].markers).toContain('python_full_version');
    expect(result.requirements[0].hashes).toHaveLength(1);

    // ansicon: markers with 3 conditions + 1 hash
    expect(result.requirements[1].name).toBe('ansicon');
    expect(result.requirements[1].markers).toContain('sys_platform');
    expect(result.requirements[1].hashes).toHaveLength(1);

    // requests-oauthlib: markers + 2 hashes
    expect(result.requirements[2].name).toBe('requests-oauthlib');
    expect(result.requirements[2].hashes).toHaveLength(2);
  });

  it('handles packages with dots and underscores in names', async () => {
    const content = `
zope.interface==6.1
ruamel.yaml.clib==0.2.8
python_dateutil==2.8.2
Pillow==10.2.0
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(4);
    // WASM (uv) parser normalizes names per PEP 503: dots/underscores become hyphens, lowercase
    const names = result.requirements.map(r => r.name);
    expect(names).toContain('zope-interface');
    expect(names).toContain('ruamel-yaml-clib');
    expect(names).toContain('python-dateutil');
    expect(names).toContain('pillow');
  });

  it('handles git URL with extras', async () => {
    const content = `
pandas[tabulate] @ git+https://github.com/pandas-dev/pandas.git
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('pandas');
    expect(result.requirements[0].extras).toEqual(['tabulate']);
    expect(result.requirements[0].url).toContain('git+');
    expect(result.requirements[0].source).toBeDefined();
    expect(result.requirements[0].source?.git).toBe(
      'https://github.com/pandas-dev/pandas.git'
    );
  });

  it('handles URL requirement with extras and markers', async () => {
    const content = `
mypackage[extra1,extra2] @ https://example.com/pkg-1.0.tar.gz ; python_version >= "3.9"
`;
    const result = await parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('mypackage');
    expect(result.requirements[0].extras).toEqual(['extra1', 'extra2']);
    expect(result.requirements[0].url).toContain('example.com');
    expect(result.requirements[0].markers).toContain('python_full_version');
  });
});
