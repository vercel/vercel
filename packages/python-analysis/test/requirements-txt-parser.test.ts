import {
  parseRequirementsFile,
  convertRequirementsToPyprojectToml,
} from '../src/manifest/requirements-txt-parser';

describe('parseRequirementsFile', () => {
  it('parses simple package names', () => {
    const content = `
flask
requests
django
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask' },
      { name: 'requests' },
      { name: 'django' },
    ]);
  });

  it('parses packages with version specifiers', () => {
    const content = `
flask>=2.0.0
requests==2.28.0
django>=4.0,<5.0
numpy~=1.24.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'django', version: '>=4.0,<5.0' },
      { name: 'numpy', version: '~=1.24.0' },
    ]);
  });

  it('parses packages with extras', () => {
    const content = `
requests[socks]
uvicorn[standard]>=0.20.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'requests', extras: ['socks'] },
      { name: 'uvicorn', version: '>=0.20.0', extras: ['standard'] },
    ]);
  });

  it('parses packages with environment markers', () => {
    const content = `
pywin32>=300 ; sys_platform == "win32"
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('pywin32');
    expect(result.requirements[0].version).toBe('>=300');
    expect(result.requirements[0].markers).toBeDefined();
  });

  it('parses URL-based requirements', () => {
    const content = `
mypackage @ https://github.com/user/repo/archive/v1.0.0.zip
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      {
        name: 'mypackage',
        url: 'https://github.com/user/repo/archive/v1.0.0.zip',
      },
    ]);
  });

  it('skips comments and empty lines', () => {
    const content = `
# This is a comment
flask>=2.0.0

# Another comment
requests==2.28.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('collects -r and -c directives in pipOptions', () => {
    const content = `
flask>=2.0.0
-r other-requirements.txt
-c constraints.txt
requests==2.28.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
    expect(result.pipOptions.requirementFiles).toEqual([
      'other-requirements.txt',
    ]);
    expect(result.pipOptions.constraintFiles).toEqual(['constraints.txt']);
  });

  it('extracts --requirement files', () => {
    const content = `
flask>=2.0.0
--requirement other.txt
--requirement=another.txt
requests==2.28.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
    expect(result.pipOptions.requirementFiles).toEqual([
      'other.txt',
      'another.txt',
    ]);
  });

  it('extracts --constraint files', () => {
    const content = `
flask>=2.0.0
--constraint constraints.txt
--constraint=more-constraints.txt
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.constraintFiles).toEqual([
      'constraints.txt',
      'more-constraints.txt',
    ]);
  });

  it('extracts -r and -c short form directives', () => {
    const content = `
flask>=2.0.0
-r other.txt
-c constraints.txt
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.requirementFiles).toEqual(['other.txt']);
    expect(result.pipOptions.constraintFiles).toEqual(['constraints.txt']);
  });

  it('extracts --index-url (keeps only last one)', () => {
    const content = `
--index-url https://pypi.example.com/simple/
flask>=2.0.0
--index-url=https://pypi.other.com/simple/
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.indexUrl).toBe('https://pypi.other.com/simple/');
  });

  it('extracts -i short form for index-url', () => {
    const content = `
-i https://pypi.example.com/simple/
flask>=2.0.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.indexUrl).toBe('https://pypi.example.com/simple/');
  });

  it('extracts --extra-index-url (collects all)', () => {
    const content = `
--extra-index-url https://pypi.extra1.com/simple/
flask>=2.0.0
--extra-index-url=https://pypi.extra2.com/simple/
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
    ]);
    expect(result.pipOptions.extraIndexUrls).toEqual([
      'https://pypi.extra1.com/simple/',
      'https://pypi.extra2.com/simple/',
    ]);
  });

  it('handles complex file with all pip options', () => {
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
    const result = parseRequirementsFile(content);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0', extras: ['socks'] },
      { name: 'django', version: '>=4.0' },
    ]);

    expect(result.pipOptions.indexUrl).toBe('https://pypi.org/simple/');
    expect(result.pipOptions.extraIndexUrls).toEqual([
      'https://private.pypi.com/simple/',
    ]);
    expect(result.pipOptions.requirementFiles).toEqual(['base.txt', 'dev.txt']);
    expect(result.pipOptions.constraintFiles).toEqual([
      'constraints.txt',
      'version-locks.txt',
    ]);
  });

  it('returns empty options when no pip arguments present', () => {
    const content = `
flask>=2.0.0
requests==2.28.0
`;
    const result = parseRequirementsFile(content);
    expect(result.pipOptions).toEqual({
      requirementFiles: [],
      constraintFiles: [],
      extraIndexUrls: [],
    });
  });

  it('handles empty file', () => {
    const result = parseRequirementsFile('');
    expect(result.requirements).toEqual([]);
    expect(result.pipOptions).toEqual({
      requirementFiles: [],
      constraintFiles: [],
      extraIndexUrls: [],
    });
  });

  it('handles file with only comments', () => {
    const content = `
# This is a comment
# Another comment
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toEqual([]);
    expect(result.pipOptions).toEqual({
      requirementFiles: [],
      constraintFiles: [],
      extraIndexUrls: [],
    });
  });

  it('extracts --hash from requirements', () => {
    const content = `
flask==2.0.0 --hash=sha256:abc123def456
requests==2.28.0
`;
    const result = parseRequirementsFile(content);
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

  it('extracts multiple --hash values for a single requirement', () => {
    const content = `
flask==2.0.0 --hash=sha256:abc123 --hash=sha256:def456 --hash=sha384:ghi789
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'flask',
      version: '==2.0.0',
      hashes: ['sha256:abc123', 'sha256:def456', 'sha384:ghi789'],
    });
  });

  it('handles --hash with line continuations', () => {
    const content = `
flask==2.0.0 \\
    --hash=sha256:abc123 \\
    --hash=sha256:def456
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'flask',
      version: '==2.0.0',
      hashes: ['sha256:abc123', 'sha256:def456'],
    });
  });

  it('handles requirements with both extras and --hash', () => {
    const content = `
uvicorn[standard]==0.20.0 --hash=sha256:abc123
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toEqual({
      name: 'uvicorn',
      version: '==0.20.0',
      extras: ['standard'],
      hashes: ['sha256:abc123'],
    });
  });

  it('handles complex file with hashes and other pip options', () => {
    const content = `
--index-url https://pypi.org/simple/
flask==2.0.0 --hash=sha256:flask_hash
requests==2.28.0 --hash=sha256:req_hash1 --hash=sha256:req_hash2
-r other.txt
django>=4.0
`;
    const result = parseRequirementsFile(content);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '==2.0.0', hashes: ['sha256:flask_hash'] },
      {
        name: 'requests',
        version: '==2.28.0',
        hashes: ['sha256:req_hash1', 'sha256:req_hash2'],
      },
      { name: 'django', version: '>=4.0' },
    ]);
    expect(result.pipOptions.indexUrl).toBe('https://pypi.org/simple/');
    expect(result.pipOptions.requirementFiles).toEqual(['other.txt']);
  });
});

describe('parseRequirementsFile with readFile', () => {
  it('follows -r references and merges requirements', () => {
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

    const result = parseRequirementsFile(mainContent, readFile);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'django', version: '>=4.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'numpy', version: '>=1.24.0' },
    ]);
  });

  it('follows --requirement references', () => {
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

    const result = parseRequirementsFile(mainContent, readFile);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('handles nested requirement files', () => {
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

    const result = parseRequirementsFile(mainContent, readFile);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
      { name: 'numpy', version: '>=1.24.0' },
    ]);
  });

  it('prevents circular references', () => {
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

    // Should not hang or throw
    const result = parseRequirementsFile(fileA, readFile);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('prevents circular references with normalized paths', () => {
    const fileA = `
flask>=2.0.0
-r ./b.txt
`;
    const fileB = `
requests==2.28.0
-r foo/../a.txt
`;
    const readFile = (path: string) => {
      // Simulate file system that resolves various path forms to the same file
      if (path === './b.txt' || path === 'b.txt') return fileB;
      if (path === 'foo/../a.txt' || path === 'a.txt') return fileA;
      return null;
    };

    // Should not hang or throw even with different path forms referencing same files
    const result = parseRequirementsFile(fileA, readFile);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '==2.28.0' },
    ]);
  });

  it('avoids duplicate requirements from referenced files', () => {
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

    const result = parseRequirementsFile(mainContent, readFile);

    // requests should only appear once (from main file, since it was seen first)
    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'requests', version: '>=2.0.0' },
      { name: 'django', version: '>=4.0' },
    ]);
  });

  it('merges pip options from referenced files', () => {
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
      return null;
    };

    const result = parseRequirementsFile(mainContent, readFile);

    expect(result.pipOptions.indexUrl).toBe('https://main.pypi.org/simple/');
    expect(result.pipOptions.extraIndexUrls).toContain(
      'https://extra.pypi.org/simple/'
    );
    expect(result.pipOptions.constraintFiles).toContain('constraints.txt');
  });

  it('later index-url from referenced file takes precedence', () => {
    const mainContent = `
--index-url https://main.pypi.org/simple/
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

    const result = parseRequirementsFile(mainContent, readFile);

    expect(result.pipOptions.indexUrl).toBe('https://deps.pypi.org/simple/');
  });

  it('handles missing referenced files gracefully', () => {
    const mainContent = `
flask>=2.0.0
-r missing.txt
django>=4.0
`;
    const readFile = () => null;

    const result = parseRequirementsFile(mainContent, readFile);

    expect(result.requirements).toEqual([
      { name: 'flask', version: '>=2.0.0' },
      { name: 'django', version: '>=4.0' },
    ]);
  });
});

describe('convertRequirementsToPyprojectToml', () => {
  it('converts simple requirements to pyproject.toml', () => {
    const content = `
flask>=2.0.0
requests==2.28.0
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        dependencies: ['flask>=2.0.0', 'requests==2.28.0'],
      },
    });
  });

  it('converts requirements with extras', () => {
    const content = `
uvicorn[standard]>=0.20.0
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        dependencies: ['uvicorn[standard]>=0.20.0'],
      },
    });
  });

  it('converts URL-based requirements', () => {
    const content = `
mypackage @ https://example.com/package.zip
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        dependencies: ['mypackage @ https://example.com/package.zip'],
      },
    });
  });

  it('returns empty object for empty requirements', () => {
    const result = convertRequirementsToPyprojectToml('');
    expect(result).toEqual({});
  });

  it('converts pip arguments when converting (except -r which needs readFile)', () => {
    const content = `
flask>=2.0.0
--index-url https://pypi.org/simple/
--requirement other.txt
requests==2.28.0
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        dependencies: ['flask>=2.0.0', 'requests==2.28.0'],
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

  it('handles requirements with environment markers', () => {
    const content = `
pywin32>=300 ; sys_platform == "win32"
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toHaveLength(1);
    expect(result.project?.dependencies?.[0]).toContain('pywin32');
    expect(result.project?.dependencies?.[0]).toContain('>=300');
    expect(result.project?.dependencies?.[0]).toContain(';');
  });

  it('strips --hash when converting to pyproject.toml', () => {
    const content = `
flask==2.0.0 --hash=sha256:abc123
requests==2.28.0 --hash=sha256:def456 --hash=sha256:ghi789
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result).toEqual({
      project: {
        dependencies: ['flask==2.0.0', 'requests==2.28.0'],
      },
    });
  });

  it('follows -r references when readFile is provided', () => {
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

    const result = convertRequirementsToPyprojectToml(mainContent, readFile);

    expect(result).toEqual({
      project: {
        dependencies: ['flask>=2.0.0', 'requests==2.28.0', 'django>=4.0'],
      },
    });
  });

  it('handles nested -r references', () => {
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

    const result = convertRequirementsToPyprojectToml(mainContent, readFile);

    expect(result).toEqual({
      project: {
        dependencies: ['flask>=2.0.0', 'requests==2.28.0', 'numpy>=1.24.0'],
      },
    });
  });

  it('parses git URL dependencies', () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git@v1.0.0
`;
    const result = parseRequirementsFile(content);
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

  it('parses git URL with branch ref', () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git@main
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements[0].source).toEqual({
      git: 'https://github.com/user/repo.git',
      rev: 'main',
    });
  });

  it('parses git URL without ref', () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements[0].source).toEqual({
      git: 'https://github.com/user/repo.git',
    });
  });

  it('parses git+ssh URL', () => {
    const content = `
mypackage @ git+ssh://git@github.com/user/repo.git@v2.0.0
`;
    const result = parseRequirementsFile(content);
    expect(result.requirements[0].source).toEqual({
      git: 'ssh://git@github.com/user/repo.git',
      rev: 'v2.0.0',
    });
  });

  it('converts git URL dependencies to pyproject.toml with sources', () => {
    const content = `
mypackage @ git+https://github.com/user/repo.git@v1.0.0
flask>=2.0.0
`;
    const result = convertRequirementsToPyprojectToml(content);
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

  it('handles multiple git dependencies', () => {
    const content = `
package1 @ git+https://github.com/user/repo1.git@v1.0.0
package2 @ git+https://github.com/user/repo2.git@main
`;
    const result = convertRequirementsToPyprojectToml(content);
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

  it('converts --index-url to tool.uv.index', () => {
    const content = `
--index-url https://private.pypi.org/simple/
flask>=2.0.0
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual(['flask>=2.0.0']);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
    ]);
  });

  it('converts --extra-index-url to tool.uv.index', () => {
    const content = `
--extra-index-url https://extra1.pypi.org/simple/
--extra-index-url https://extra2.pypi.org/simple/
flask>=2.0.0
`;
    const result = convertRequirementsToPyprojectToml(content);
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

  it('converts both --index-url and --extra-index-url to tool.uv.index', () => {
    const content = `
--index-url https://private.pypi.org/simple/
--extra-index-url https://extra.pypi.org/simple/
flask>=2.0.0
requests>=2.28.0
`;
    const result = convertRequirementsToPyprojectToml(content);
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

  it('converts -i short form to tool.uv.index', () => {
    const content = `
-i https://private.pypi.org/simple/
flask>=2.0.0
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'primary',
        url: 'https://private.pypi.org/simple/',
        default: true,
      },
    ]);
  });

  it('combines git sources and index URLs in tool.uv', () => {
    const content = `
--index-url https://private.pypi.org/simple/
mypackage @ git+https://github.com/user/repo.git@v1.0.0
flask>=2.0.0
`;
    const result = convertRequirementsToPyprojectToml(content);
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

  it('does not include tool.uv when no index URLs or sources', () => {
    const content = `
flask>=2.0.0
requests>=2.28.0
`;
    const result = convertRequirementsToPyprojectToml(content);
    expect(result.project?.dependencies).toEqual([
      'flask>=2.0.0',
      'requests>=2.28.0',
    ]);
    expect(result.tool).toBeUndefined();
  });
});
