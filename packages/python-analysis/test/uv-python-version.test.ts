import {
  parseUvPythonRequest,
  parsePythonVersionFile,
  pythonRequestFromConstraint,
} from '../src/manifest/uv-python-version';

describe('parseUvPythonRequest', () => {
  describe('empty and special inputs', () => {
    it('returns null for empty string', () => {
      expect(parseUvPythonRequest('')).toBeNull();
    });

    it('returns null for whitespace only', () => {
      expect(parseUvPythonRequest('   ')).toBeNull();
    });

    it('returns empty object for "any"', () => {
      expect(parseUvPythonRequest('any')).toEqual({});
    });

    it('returns empty object for "default"', () => {
      expect(parseUvPythonRequest('default')).toEqual({});
    });

    it('handles case insensitivity for any/default', () => {
      expect(parseUvPythonRequest('ANY')).toEqual({});
      expect(parseUvPythonRequest('Default')).toEqual({});
    });
  });

  describe('version-only requests', () => {
    it('parses major version only', () => {
      const result = parseUvPythonRequest('3');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses major.minor version', () => {
      const result = parseUvPythonRequest('3.12');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.12', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses major.minor.patch version', () => {
      const result = parseUvPythonRequest('3.12.3');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.12.3', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses cpython3.12.2 (implementation followed by version)', () => {
      const result = parseUvPythonRequest('cpython3.12.2');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.12.2', prefix: '' }],
          variant: 'default',
        },
      });
    });
  });

  describe('version specifier requests', () => {
    it('parses >= constraint', () => {
      const result = parseUvPythonRequest('>=3.12');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint).toHaveLength(1);
      expect(result?.version?.constraint[0].operator).toBe('>=');
      expect(result?.version?.constraint[0].version).toBe('3.12');
    });

    it('parses compound constraint >=3.12,<3.13', () => {
      const result = parseUvPythonRequest('>=3.12,<3.13');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint).toHaveLength(2);
      expect(result?.version?.constraint[0].operator).toBe('>=');
      expect(result?.version?.constraint[0].version).toBe('3.12');
      expect(result?.version?.constraint[1].operator).toBe('<');
      expect(result?.version?.constraint[1].version).toBe('3.13');
    });

    it('parses ~= constraint', () => {
      const result = parseUvPythonRequest('~=3.12');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].operator).toBe('~=');
    });
  });

  describe('prerelease versions', () => {
    it('parses alpha prerelease version 3.13.0a1', () => {
      const result = parseUvPythonRequest('3.13.0a1');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.13.0a1');
    });

    it('parses beta prerelease version 3.13.0b5', () => {
      const result = parseUvPythonRequest('3.13.0b5');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.13.0b5');
    });

    it('parses release candidate version 3.13.0rc1', () => {
      const result = parseUvPythonRequest('3.13.0rc1');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.13.0rc1');
    });
  });

  describe('variant suffixes', () => {
    it('parses freethreaded short variant (t)', () => {
      const result = parseUvPythonRequest('3.13t');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.13', prefix: '' }],
          variant: 'freethreaded',
        },
      });
    });

    it('parses debug short variant (d)', () => {
      const result = parseUvPythonRequest('3.12.0d');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.12.0', prefix: '' }],
          variant: 'debug',
        },
      });
    });

    it('parses freethreaded+debug short variant (td)', () => {
      const result = parseUvPythonRequest('3.13td');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.13', prefix: '' }],
          variant: 'freethreaded+debug',
        },
      });
    });

    it('parses +freethreaded long variant', () => {
      const result = parseUvPythonRequest('3.13+freethreaded');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.13', prefix: '' }],
          variant: 'freethreaded',
        },
      });
    });

    it('parses +debug long variant', () => {
      const result = parseUvPythonRequest('3.12.0+debug');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.12.0');
      expect(result?.version?.variant).toBe('debug');
    });

    it('parses +gil long variant', () => {
      const result = parseUvPythonRequest('3.14+gil');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.14', prefix: '' }],
          variant: 'gil',
        },
      });
    });
  });

  describe('implementation requests', () => {
    it('parses cpython implementation alone', () => {
      expect(parseUvPythonRequest('cpython')).toEqual({
        implementation: 'cpython',
      });
    });

    it('parses python as cpython', () => {
      expect(parseUvPythonRequest('python')).toEqual({
        implementation: 'cpython',
      });
    });

    it('parses cp short form as cpython', () => {
      expect(parseUvPythonRequest('cp')).toEqual({
        implementation: 'cpython',
      });
    });

    it('parses pypy implementation', () => {
      expect(parseUvPythonRequest('pypy')).toEqual({
        implementation: 'pypy',
      });
    });

    it('parses pp short form as pypy', () => {
      expect(parseUvPythonRequest('pp')).toEqual({
        implementation: 'pypy',
      });
    });

    it('parses graalpy implementation', () => {
      expect(parseUvPythonRequest('graalpy')).toEqual({
        implementation: 'graalpy',
      });
    });

    it('parses gp short form as graalpy', () => {
      expect(parseUvPythonRequest('gp')).toEqual({
        implementation: 'graalpy',
      });
    });

    it('parses pyodide implementation', () => {
      expect(parseUvPythonRequest('pyodide')).toEqual({
        implementation: 'pyodide',
      });
    });
  });

  describe('implementation with version', () => {
    it('parses cpython@3.12', () => {
      const result = parseUvPythonRequest('cpython@3.12');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.12', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses cpython3.12 (no separator)', () => {
      const result = parseUvPythonRequest('cpython3.12');
      expect(result).toEqual({
        implementation: 'cpython',
        version: {
          constraint: [{ operator: '==', version: '3.12', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses pypy@3.10', () => {
      const result = parseUvPythonRequest('pypy@3.10');
      expect(result).toEqual({
        implementation: 'pypy',
        version: {
          constraint: [{ operator: '==', version: '3.10', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses pypy3.10 (no separator)', () => {
      const result = parseUvPythonRequest('pypy3.10');
      expect(result).toEqual({
        implementation: 'pypy',
        version: {
          constraint: [{ operator: '==', version: '3.10', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses pypy310 (compact form)', () => {
      const result = parseUvPythonRequest('pypy310');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('pypy');
    });

    it('parses pp310 (short form with compact version)', () => {
      const result = parseUvPythonRequest('pp310');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('pypy');
    });

    it('parses graalpy@3.10', () => {
      const result = parseUvPythonRequest('graalpy@3.10');
      expect(result).toEqual({
        implementation: 'graalpy',
        version: {
          constraint: [{ operator: '==', version: '3.10', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses graalpy3.10 (no separator)', () => {
      const result = parseUvPythonRequest('graalpy3.10');
      expect(result).toEqual({
        implementation: 'graalpy',
        version: {
          constraint: [{ operator: '==', version: '3.10', prefix: '' }],
          variant: 'default',
        },
      });
    });

    it('parses graalpy310 (compact form)', () => {
      const result = parseUvPythonRequest('graalpy310');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('graalpy');
    });

    it('parses gp310 (short form with compact version)', () => {
      const result = parseUvPythonRequest('gp310');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('graalpy');
    });

    it('parses cp38 (short form with compact version)', () => {
      const result = parseUvPythonRequest('cp38');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
    });

    it('parses cp312 (short form with version)', () => {
      const result = parseUvPythonRequest('cp312');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
    });

    it('parses implementation with version specifier', () => {
      const result = parseUvPythonRequest('cpython>=3.12,<3.13');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint).toHaveLength(2);
    });
  });

  describe('platform requests (key format)', () => {
    it('parses cpython-3.13.2 as platform request', () => {
      const result = parseUvPythonRequest('cpython-3.13.2');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.13.2');
    });

    it('parses full platform request: cpython-3.12.3-macos-aarch64-none', () => {
      const result = parseUvPythonRequest('cpython-3.12.3-macos-aarch64-none');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.12.3');
      expect(result?.platform).toEqual({
        os: 'macos',
        arch: 'aarch64',
        libc: 'none',
      });
    });

    it('parses platform request with linux-x86_64-gnu', () => {
      const result = parseUvPythonRequest('cpython-3.11-linux-x86_64-gnu');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.platform?.os).toBe('linux');
      expect(result?.platform?.arch).toBe('x86_64');
      expect(result?.platform?.libc).toBe('gnu');
    });

    it('parses any-3.13.2 (any implementation with version)', () => {
      const result = parseUvPythonRequest('any-3.13.2');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBeUndefined();
      expect(result?.version?.constraint[0].version).toBe('3.13.2');
    });

    it('parses any-3.13.2-any-aarch64 (partial platform)', () => {
      const result = parseUvPythonRequest('any-3.13.2-any-aarch64');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBeUndefined();
      expect(result?.version?.constraint[0].version).toBe('3.13.2');
      expect(result?.platform?.os).toBeUndefined();
      expect(result?.platform?.arch).toBe('aarch64');
    });

    it('parses platform request with any segments', () => {
      const result = parseUvPythonRequest('cpython-any-linux-any-any');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version).toBeUndefined();
      expect(result?.platform?.os).toBe('linux');
      expect(result?.platform?.arch).toBeUndefined();
      expect(result?.platform?.libc).toBeUndefined();
    });

    it('parses platform request with only implementation and version', () => {
      const result = parseUvPythonRequest('cpython-3.12');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.version?.constraint[0].version).toBe('3.12');
      expect(result?.platform).toBeUndefined();
    });

    it('parses platform request with os only', () => {
      const result = parseUvPythonRequest('cpython-3.12-linux');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBe('cpython');
      expect(result?.platform?.os).toBe('linux');
      expect(result?.platform?.arch).toBeUndefined();
    });

    it('parses any-any-any-any-any as empty request', () => {
      const result = parseUvPythonRequest('any-any-any-any-any');
      expect(result).not.toBeNull();
      expect(result?.implementation).toBeUndefined();
      expect(result?.version).toBeUndefined();
      expect(result?.platform).toBeUndefined();
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase implementation names', () => {
      expect(parseUvPythonRequest('CPYTHON')).toEqual({
        implementation: 'cpython',
      });
    });

    it('handles mixed case implementation names', () => {
      expect(parseUvPythonRequest('CPython')).toEqual({
        implementation: 'cpython',
      });
    });

    it('handles uppercase version requests', () => {
      const result = parseUvPythonRequest('CPYTHON@3.12');
      expect(result?.implementation).toBe('cpython');
    });
  });

  describe('edge cases', () => {
    it('returns null for invalid input without hyphens', () => {
      // Input without hyphens that doesn't match any known format
      expect(parseUvPythonRequest('invalidinput')).toBeNull();
    });

    it('returns null for hyphenated input that fails impl and version parsing', () => {
      // When both implementation and version parsing fail, should return null
      expect(parseUvPythonRequest('not-a-valid-request-xyz')).toBeNull();
    });

    it('trims whitespace from input', () => {
      const result = parseUvPythonRequest('  3.12  ');
      expect(result).not.toBeNull();
      expect(result?.version?.constraint[0].version).toBe('3.12');
    });
  });
});

describe('parsePythonVersionFile', () => {
  it('parses single version line', () => {
    const result = parsePythonVersionFile('3.12');
    expect(result).toHaveLength(1);
    expect(result?.[0].implementation).toBe('cpython');
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
  });

  it('parses multiple version lines', () => {
    const content = `3.12
3.11
3.10`;
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(3);
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
    expect(result?.[1].version?.constraint[0].version).toBe('3.11');
    expect(result?.[2].version?.constraint[0].version).toBe('3.10');
  });

  it('skips empty lines', () => {
    const content = `3.12

3.11

`;
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(2);
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
    expect(result?.[1].version?.constraint[0].version).toBe('3.11');
  });

  it('skips comment lines', () => {
    const content = `# This is a comment
3.12
# Another comment
3.11`;
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(2);
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
    expect(result?.[1].version?.constraint[0].version).toBe('3.11');
  });

  it('returns null for empty file', () => {
    expect(parsePythonVersionFile('')).toBeNull();
  });

  it('returns null for file with only comments', () => {
    const content = `# Comment 1
# Comment 2`;
    expect(parsePythonVersionFile(content)).toBeNull();
  });

  it('returns null for file with only whitespace', () => {
    const content = `

    `;
    expect(parsePythonVersionFile(content)).toBeNull();
  });

  it('handles Windows line endings (CRLF)', () => {
    const content = '3.12\r\n3.11\r\n';
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(2);
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
    expect(result?.[1].version?.constraint[0].version).toBe('3.11');
  });

  it('handles mixed content with implementations and versions', () => {
    const content = `cpython@3.12
pypy@3.10
3.9`;
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(3);
    expect(result?.[0].implementation).toBe('cpython');
    expect(result?.[1].implementation).toBe('pypy');
    expect(result?.[2].implementation).toBe('cpython');
  });

  it('parses version with variant suffix', () => {
    const content = '3.13t';
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(1);
    expect(result?.[0].version?.variant).toBe('freethreaded');
  });

  it('parses version specifier constraints', () => {
    const content = '>=3.12,<3.14';
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(1);
    expect(result?.[0].version?.constraint).toHaveLength(2);
  });

  it('handles whitespace around version lines', () => {
    const content = `  3.12
    3.11    `;
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(2);
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
    expect(result?.[1].version?.constraint[0].version).toBe('3.11');
  });

  it('skips invalid lines gracefully', () => {
    const content = `3.12
invalidinput
3.11`;
    const result = parsePythonVersionFile(content);
    // Invalid lines return null from parseUvPythonRequest and are skipped
    expect(result).toHaveLength(2);
    expect(result?.[0].version?.constraint[0].version).toBe('3.12');
    expect(result?.[1].version?.constraint[0].version).toBe('3.11');
  });

  it('parses platform-specific requests', () => {
    const content = 'cpython-3.12.3-macos-aarch64-none';
    const result = parsePythonVersionFile(content);
    expect(result).toHaveLength(1);
    expect(result?.[0].platform?.os).toBe('macos');
    expect(result?.[0].platform?.arch).toBe('aarch64');
  });
});

describe('pythonRequestFromConstraint', () => {
  it('creates request from single constraint', () => {
    const constraint = [{ operator: '>=', version: '3.12', prefix: '' }];
    const result = pythonRequestFromConstraint(constraint);
    expect(result).toEqual({
      implementation: 'cpython',
      version: {
        constraint,
        variant: 'default',
      },
    });
  });

  it('creates request from multiple constraints', () => {
    const constraint = [
      { operator: '>=', version: '3.12', prefix: '' },
      { operator: '<', version: '3.14', prefix: '' },
    ];
    const result = pythonRequestFromConstraint(constraint);
    expect(result).toEqual({
      implementation: 'cpython',
      version: {
        constraint,
        variant: 'default',
      },
    });
  });

  it('creates request from empty constraint array', () => {
    const result = pythonRequestFromConstraint([]);
    expect(result).toEqual({
      implementation: 'cpython',
      version: {
        constraint: [],
        variant: 'default',
      },
    });
  });

  it('always uses cpython as implementation', () => {
    const constraint = [{ operator: '==', version: '3.10', prefix: '' }];
    const result = pythonRequestFromConstraint(constraint);
    expect(result.implementation).toBe('cpython');
  });

  it('always uses default variant', () => {
    const constraint = [{ operator: '==', version: '3.13', prefix: '' }];
    const result = pythonRequestFromConstraint(constraint);
    expect(result.version?.variant).toBe('default');
  });
});
