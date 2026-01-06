import {
  selectPython,
  pythonVersionToString,
  pep440ConstraintsToString,
  implementationsMatch,
  variantsMatch,
  buildMatchesRequest,
  buildMatchesConstraint,
} from '../src/manifest/python-selector';
import {
  PythonBuild,
  PythonConstraint,
  PythonImplementation,
  PythonRequest,
  PythonVariant,
  PythonVersion,
} from '../src/manifest/types/python-specifiers';
import { Pep440Constraint } from '../src/manifest/pep440';

// Helper to create a PythonBuild for testing
function makeBuild(
  overrides: Partial<PythonBuild> & { version: PythonVersion }
): PythonBuild {
  return {
    implementation: 'cpython',
    variant: 'default',
    architecture: 'x86_64',
    os: 'linux',
    libc: 'gnu',
    ...overrides,
  };
}

// Helper to create a version constraint
function makeVersionConstraint(
  operator: string,
  version: string
): Pep440Constraint {
  return { operator, version, prefix: '' };
}

// Helper to create a PythonRequest
function makeRequest(overrides: Partial<PythonRequest> = {}): PythonRequest {
  return { ...overrides };
}

// Helper to create a PythonConstraint
function makeConstraint(
  request: PythonRequest[],
  source: string
): PythonConstraint {
  return { request, source };
}

describe('pythonVersionToString', () => {
  it('converts major.minor version', () => {
    expect(pythonVersionToString({ major: 3, minor: 12 })).toBe('3.12');
  });

  it('converts major.minor.patch version', () => {
    expect(pythonVersionToString({ major: 3, minor: 12, patch: 3 })).toBe(
      '3.12.3'
    );
  });

  it('converts version with prerelease', () => {
    expect(
      pythonVersionToString({ major: 3, minor: 13, patch: 0, prerelease: 'a1' })
    ).toBe('3.13.0a1');
  });

  it('converts version with prerelease but no patch', () => {
    expect(
      pythonVersionToString({ major: 3, minor: 13, prerelease: 'b2' })
    ).toBe('3.13b2');
  });

  it('handles patch version of 0', () => {
    expect(pythonVersionToString({ major: 3, minor: 11, patch: 0 })).toBe(
      '3.11.0'
    );
  });
});

describe('pep440ConstraintsToString', () => {
  it('converts single constraint', () => {
    expect(
      pep440ConstraintsToString([makeVersionConstraint('>=', '3.12')])
    ).toBe('>=3.12');
  });

  it('converts multiple constraints', () => {
    expect(
      pep440ConstraintsToString([
        makeVersionConstraint('>=', '3.12'),
        makeVersionConstraint('<', '3.14'),
      ])
    ).toBe('>=3.12,<3.14');
  });

  it('handles empty constraints array', () => {
    expect(pep440ConstraintsToString([])).toBe('');
  });

  it('handles constraint with prefix', () => {
    expect(
      pep440ConstraintsToString([
        { operator: '==', version: '3.12', prefix: '!' },
      ])
    ).toBe('==!3.12');
  });
});

describe('implementationsMatch', () => {
  it('matches identical known implementations', () => {
    expect(implementationsMatch('cpython', 'cpython')).toBe(true);
    expect(implementationsMatch('pypy', 'pypy')).toBe(true);
  });

  it('does not match different known implementations', () => {
    expect(implementationsMatch('cpython', 'pypy')).toBe(false);
    expect(implementationsMatch('pypy', 'cpython')).toBe(false);
  });

  it('matches identical unknown implementations', () => {
    expect(
      implementationsMatch(
        { implementation: 'custom' },
        { implementation: 'custom' }
      )
    ).toBe(true);
  });

  it('does not match different unknown implementations', () => {
    expect(
      implementationsMatch(
        { implementation: 'custom1' },
        { implementation: 'custom2' }
      )
    ).toBe(false);
  });

  it('does not match known with unknown implementation', () => {
    expect(implementationsMatch('cpython', { implementation: 'cpython' })).toBe(
      false
    );
    expect(implementationsMatch({ implementation: 'cpython' }, 'cpython')).toBe(
      false
    );
  });
});

describe('variantsMatch', () => {
  it('matches identical known variants', () => {
    expect(variantsMatch('default', 'default')).toBe(true);
    expect(variantsMatch('debug', 'debug')).toBe(true);
    expect(variantsMatch('freethreaded', 'freethreaded')).toBe(true);
  });

  it('does not match different known variants', () => {
    expect(variantsMatch('default', 'debug')).toBe(false);
    expect(variantsMatch('freethreaded', 'default')).toBe(false);
  });

  it('matches identical unknown variants', () => {
    expect(
      variantsMatch(
        { type: 'unknown', variant: 'custom' },
        { type: 'unknown', variant: 'custom' }
      )
    ).toBe(true);
  });

  it('does not match different unknown variants', () => {
    expect(
      variantsMatch(
        { type: 'unknown', variant: 'custom1' },
        { type: 'unknown', variant: 'custom2' }
      )
    ).toBe(false);
  });

  it('does not match known with unknown variant', () => {
    expect(
      variantsMatch('default', { type: 'unknown', variant: 'default' })
    ).toBe(false);
    expect(
      variantsMatch({ type: 'unknown', variant: 'default' }, 'default')
    ).toBe(false);
  });
});

describe('buildMatchesRequest', () => {
  const defaultBuild = makeBuild({
    version: { major: 3, minor: 12, patch: 3 },
    implementation: 'cpython',
    variant: 'default',
    os: 'linux',
    architecture: 'x86_64',
    libc: 'gnu',
  });

  describe('implementation matching', () => {
    it('matches when implementation is not specified', () => {
      expect(buildMatchesRequest(defaultBuild, makeRequest({}))).toBe(true);
    });

    it('matches when implementation matches', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ implementation: 'cpython' })
        )
      ).toBe(true);
    });

    it('does not match when implementation differs', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ implementation: 'pypy' })
        )
      ).toBe(false);
    });
  });

  describe('version matching', () => {
    it('matches when version is not specified', () => {
      expect(buildMatchesRequest(defaultBuild, makeRequest({}))).toBe(true);
    });

    it('matches exact version', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: {
              constraint: [makeVersionConstraint('==', '3.12.3')],
            },
          })
        )
      ).toBe(true);
    });

    it('matches version range with >=', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: {
              constraint: [makeVersionConstraint('>=', '3.12')],
            },
          })
        )
      ).toBe(true);
    });

    it('matches version range with >= and <', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: {
              constraint: [
                makeVersionConstraint('>=', '3.12'),
                makeVersionConstraint('<', '3.13'),
              ],
            },
          })
        )
      ).toBe(true);
    });

    it('does not match when version is outside range', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: {
              constraint: [makeVersionConstraint('>=', '3.13')],
            },
          })
        )
      ).toBe(false);
    });

    it('does not match when version is below minimum', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: {
              constraint: [makeVersionConstraint('<', '3.12')],
            },
          })
        )
      ).toBe(false);
    });

    it('matches when constraint array is empty', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: { constraint: [] },
          })
        )
      ).toBe(true);
    });
  });

  describe('variant matching', () => {
    it('matches when variant is not specified', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: { constraint: [] },
          })
        )
      ).toBe(true);
    });

    it('matches when variant matches', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: { constraint: [], variant: 'default' },
          })
        )
      ).toBe(true);
    });

    it('does not match when variant differs', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            version: { constraint: [], variant: 'freethreaded' },
          })
        )
      ).toBe(false);
    });

    it('matches freethreaded build with freethreaded request', () => {
      const freethreadedBuild = makeBuild({
        version: { major: 3, minor: 13 },
        variant: 'freethreaded',
      });
      expect(
        buildMatchesRequest(
          freethreadedBuild,
          makeRequest({
            version: { constraint: [], variant: 'freethreaded' },
          })
        )
      ).toBe(true);
    });
  });

  describe('platform matching', () => {
    it('matches when platform is not specified', () => {
      expect(buildMatchesRequest(defaultBuild, makeRequest({}))).toBe(true);
    });

    it('matches when os matches', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { os: 'linux' } })
        )
      ).toBe(true);
    });

    it('matches os case-insensitively', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { os: 'Linux' } })
        )
      ).toBe(true);
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { os: 'LINUX' } })
        )
      ).toBe(true);
    });

    it('does not match when os differs', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { os: 'macos' } })
        )
      ).toBe(false);
    });

    it('matches when arch matches', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { arch: 'x86_64' } })
        )
      ).toBe(true);
    });

    it('matches arch case-insensitively', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { arch: 'X86_64' } })
        )
      ).toBe(true);
    });

    it('does not match when arch differs', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { arch: 'aarch64' } })
        )
      ).toBe(false);
    });

    it('matches when libc matches', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { libc: 'gnu' } })
        )
      ).toBe(true);
    });

    it('matches libc case-insensitively', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { libc: 'gnu' } })
        )
      ).toBe(true);
    });

    it('does not match when libc differs', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({ platform: { libc: 'musl' } })
        )
      ).toBe(false);
    });

    it('matches when all platform fields match', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            platform: { os: 'linux', arch: 'x86_64', libc: 'gnu' },
          })
        )
      ).toBe(true);
    });

    it('does not match when any platform field differs', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            platform: { os: 'linux', arch: 'aarch64', libc: 'gnu' },
          })
        )
      ).toBe(false);
    });
  });

  describe('combined matching', () => {
    it('matches when all specified fields match', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            implementation: 'cpython',
            version: {
              constraint: [makeVersionConstraint('>=', '3.12')],
              variant: 'default',
            },
            platform: { os: 'linux', arch: 'x86_64' },
          })
        )
      ).toBe(true);
    });

    it('does not match when implementation differs but others match', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            implementation: 'pypy',
            version: {
              constraint: [makeVersionConstraint('>=', '3.12')],
            },
            platform: { os: 'linux' },
          })
        )
      ).toBe(false);
    });

    it('does not match when version differs but others match', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            implementation: 'cpython',
            version: {
              constraint: [makeVersionConstraint('>=', '3.13')],
            },
            platform: { os: 'linux' },
          })
        )
      ).toBe(false);
    });

    it('does not match when platform differs but others match', () => {
      expect(
        buildMatchesRequest(
          defaultBuild,
          makeRequest({
            implementation: 'cpython',
            version: {
              constraint: [makeVersionConstraint('>=', '3.12')],
            },
            platform: { os: 'macos' },
          })
        )
      ).toBe(false);
    });
  });
});

describe('buildMatchesConstraint', () => {
  const build = makeBuild({
    version: { major: 3, minor: 12, patch: 3 },
    implementation: 'cpython',
  });

  it('matches when constraint has no requests (empty array)', () => {
    expect(buildMatchesConstraint(build, makeConstraint([], 'empty'))).toBe(
      true
    );
  });

  it('matches when at least one request matches', () => {
    const constraint = makeConstraint(
      [
        makeRequest({ implementation: 'pypy' }), // doesn't match
        makeRequest({ implementation: 'cpython' }), // matches
      ],
      'test'
    );
    expect(buildMatchesConstraint(build, constraint)).toBe(true);
  });

  it('does not match when no requests match', () => {
    const constraint = makeConstraint(
      [
        makeRequest({ implementation: 'pypy' }),
        makeRequest({
          version: { constraint: [makeVersionConstraint('>=', '3.13')] },
        }),
      ],
      'test'
    );
    expect(buildMatchesConstraint(build, constraint)).toBe(false);
  });

  it('matches single request that matches', () => {
    const constraint = makeConstraint(
      [
        makeRequest({
          version: { constraint: [makeVersionConstraint('>=', '3.12')] },
        }),
      ],
      'test'
    );
    expect(buildMatchesConstraint(build, constraint)).toBe(true);
  });

  it('does not match single request that does not match', () => {
    const constraint = makeConstraint(
      [
        makeRequest({
          version: { constraint: [makeVersionConstraint('>=', '3.13')] },
        }),
      ],
      'test'
    );
    expect(buildMatchesConstraint(build, constraint)).toBe(false);
  });
});

describe('selectPython', () => {
  const builds: PythonBuild[] = [
    makeBuild({
      version: { major: 3, minor: 11, patch: 9 },
      implementation: 'cpython',
      os: 'linux',
      architecture: 'x86_64',
    }),
    makeBuild({
      version: { major: 3, minor: 12, patch: 3 },
      implementation: 'cpython',
      os: 'linux',
      architecture: 'x86_64',
    }),
    makeBuild({
      version: { major: 3, minor: 12, patch: 3 },
      implementation: 'cpython',
      os: 'macos',
      architecture: 'aarch64',
    }),
    makeBuild({
      version: { major: 3, minor: 13, patch: 0 },
      implementation: 'cpython',
      os: 'linux',
      architecture: 'x86_64',
    }),
    makeBuild({
      version: { major: 3, minor: 12, patch: 0 },
      implementation: 'pypy',
      os: 'linux',
      architecture: 'x86_64',
    }),
  ];

  describe('no constraints', () => {
    it('returns first available build when no constraints', () => {
      const result = selectPython([], builds);
      expect(result.build).toBe(builds[0]);
      expect(result.errors).toBeUndefined();
      expect(result.warnings).toBeUndefined();
    });

    it('returns null with error when no builds available', () => {
      const result = selectPython([], []);
      expect(result.build).toBeNull();
      expect(result.errors).toEqual(['No Python builds available']);
    });
  });

  describe('single constraint', () => {
    it('returns first build matching version constraint', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'pyproject.toml'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[1]); // 3.12.3
      expect(result.errors).toBeUndefined();
    });

    it('returns first build matching implementation constraint', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [makeRequest({ implementation: 'pypy' })],
          '.python-version'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[4]); // pypy 3.12.0
      expect(result.errors).toBeUndefined();
    });

    it('returns first build matching platform constraint', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [makeRequest({ platform: { os: 'macos' } })],
          'platform requirement'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[2]); // macos aarch64
      expect(result.errors).toBeUndefined();
    });

    it('returns error when no build matches single constraint', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.14')],
              },
            }),
          ],
          'pyproject.toml'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBeNull();
      expect(result.errors).toContain(
        'No Python build satisfies all constraints: pyproject.toml'
      );
    });
  });

  describe('multiple constraints', () => {
    it('returns first build matching all constraints', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'pyproject.toml'
        ),
        makeConstraint(
          [makeRequest({ platform: { os: 'linux' } })],
          'platform requirement'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[1]); // 3.12.3 linux
      expect(result.errors).toBeUndefined();
    });

    it('returns first build matching version range and implementation', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [
                  makeVersionConstraint('>=', '3.12'),
                  makeVersionConstraint('<', '3.13'),
                ],
              },
            }),
          ],
          'requires-python'
        ),
        makeConstraint(
          [makeRequest({ implementation: 'cpython' })],
          '.python-version'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[1]); // cpython 3.12.3
      expect(result.errors).toBeUndefined();
    });

    it('returns error when constraints do not overlap', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('<', '3.12')],
              },
            }),
          ],
          'pyproject.toml requires <3.12'
        ),
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.13')],
              },
            }),
          ],
          '.python-version requires >=3.13'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBeNull();
      expect(result.errors).toContain(
        'No Python build satisfies all constraints: pyproject.toml requires <3.12, .python-version requires >=3.13'
      );
      expect(result.warnings).toContain(
        'Python version constraints may not overlap: pyproject.toml requires <3.12, .python-version requires >=3.13'
      );
    });

    it('returns error without overlap warning when only one constraint has matches', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'pyproject.toml'
        ),
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '4.0')],
              },
            }),
          ],
          'impossible constraint'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBeNull();
      expect(result.errors).toContain(
        'No Python build satisfies all constraints: pyproject.toml, impossible constraint'
      );
      // Should not have overlap warning since only one constraint has matches
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('constraint with multiple requests (OR logic)', () => {
    it('matches when any request in constraint matches', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('==', '3.10')],
              },
            }), // no match
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('==', '3.12.3')],
              },
            }), // matches
          ],
          'flexible version'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[1]); // 3.12.3
      expect(result.errors).toBeUndefined();
    });

    it('matches first build that satisfies OR constraint', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({ platform: { os: 'windows' } }), // no match
            makeRequest({ platform: { os: 'linux' } }), // matches
          ],
          'cross-platform'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[0]); // first linux build
      expect(result.errors).toBeUndefined();
    });
  });

  describe('first match behavior', () => {
    it('returns first matching build in order', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [makeRequest({ implementation: 'cpython' })],
          'cpython only'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[0]); // First cpython build
    });

    it('returns first build when multiple match all constraints', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.11')],
              },
            }),
          ],
          'version constraint'
        ),
        makeConstraint(
          [makeRequest({ platform: { os: 'linux' } })],
          'os constraint'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[0]); // 3.11.9 linux (first match)
    });
  });

  describe('empty requests in constraint', () => {
    it('constraint with empty requests matches all builds', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint([], 'empty constraint'),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[0]);
      expect(result.errors).toBeUndefined();
    });

    it('empty constraint combined with specific constraint', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint([], 'empty'),
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.13')],
              },
            }),
          ],
          'version'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[3]); // 3.13.0
    });
  });

  describe('complex scenarios', () => {
    it('handles three constraints', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'version'
        ),
        makeConstraint(
          [makeRequest({ implementation: 'cpython' })],
          'implementation'
        ),
        makeConstraint(
          [makeRequest({ platform: { os: 'linux', arch: 'x86_64' } })],
          'platform'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[1]); // cpython 3.12.3 linux x86_64
    });

    it('handles version range that excludes all builds', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [
                  makeVersionConstraint('>=', '3.12'),
                  makeVersionConstraint('<', '3.12'),
                ],
              },
            }),
          ],
          'impossible range'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBeNull();
      expect(result.errors).toBeDefined();
    });

    it('handles mixed implementation and version requirements', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              implementation: 'pypy',
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'pypy 3.12+'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBe(builds[4]); // pypy 3.12.0
    });
  });

  describe('edge cases', () => {
    it('handles single build in available list', () => {
      const singleBuild = [builds[0]];
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.11')],
              },
            }),
          ],
          'test'
        ),
      ];
      const result = selectPython(constraints, singleBuild);
      expect(result.build).toBe(builds[0]);
    });

    it('handles single build that does not match', () => {
      const singleBuild = [builds[0]]; // 3.11.9
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'test'
        ),
      ];
      const result = selectPython(constraints, singleBuild);
      expect(result.build).toBeNull();
      expect(result.errors).toBeDefined();
    });

    it('handles constraint source in error message', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '4.0')],
              },
            }),
          ],
          'my-custom-source.toml'
        ),
      ];
      const result = selectPython(constraints, builds);
      expect(result.build).toBeNull();
      expect(result.errors?.[0]).toContain('my-custom-source.toml');
    });

    it('handles prerelease versions', () => {
      const buildsWithPrerelease = [
        makeBuild({
          version: { major: 3, minor: 13, patch: 0, prerelease: 'a1' },
        }),
        makeBuild({
          version: { major: 3, minor: 12, patch: 3 },
        }),
      ];
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.13')],
              },
            }),
          ],
          'test'
        ),
      ];
      // Prerelease 3.13.0a1 should not satisfy >=3.13 by default PEP 440 semantics
      const result = selectPython(constraints, buildsWithPrerelease);
      expect(result.build).toBeNull();
    });

    it('handles version with only major.minor', () => {
      const buildsSimple = [makeBuild({ version: { major: 3, minor: 12 } })];
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.12')],
              },
            }),
          ],
          'test'
        ),
      ];
      const result = selectPython(constraints, buildsSimple);
      expect(result.build).toBe(buildsSimple[0]);
    });
  });

  describe('variant selection', () => {
    const buildsWithVariants: PythonBuild[] = [
      makeBuild({
        version: { major: 3, minor: 13 },
        variant: 'default',
      }),
      makeBuild({
        version: { major: 3, minor: 13 },
        variant: 'freethreaded',
      }),
      makeBuild({
        version: { major: 3, minor: 13 },
        variant: 'debug',
      }),
    ];

    it('selects default variant when not specified', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.13')],
              },
            }),
          ],
          'test'
        ),
      ];
      const result = selectPython(constraints, buildsWithVariants);
      expect(result.build).toBe(buildsWithVariants[0]); // first match (default)
    });

    it('selects freethreaded variant when specified', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.13')],
                variant: 'freethreaded',
              },
            }),
          ],
          'test'
        ),
      ];
      const result = selectPython(constraints, buildsWithVariants);
      expect(result.build).toBe(buildsWithVariants[1]);
    });

    it('selects debug variant when specified', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [
            makeRequest({
              version: {
                constraint: [makeVersionConstraint('>=', '3.13')],
                variant: 'debug',
              },
            }),
          ],
          'test'
        ),
      ];
      const result = selectPython(constraints, buildsWithVariants);
      expect(result.build).toBe(buildsWithVariants[2]);
    });
  });

  describe('architecture selection', () => {
    const buildsMultiArch: PythonBuild[] = [
      makeBuild({
        version: { major: 3, minor: 12 },
        os: 'linux',
        architecture: 'x86_64',
      }),
      makeBuild({
        version: { major: 3, minor: 12 },
        os: 'linux',
        architecture: 'aarch64',
      }),
      makeBuild({
        version: { major: 3, minor: 12 },
        os: 'macos',
        architecture: 'aarch64',
      }),
    ];

    it('selects correct architecture', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [makeRequest({ platform: { arch: 'aarch64' } })],
          'test'
        ),
      ];
      const result = selectPython(constraints, buildsMultiArch);
      expect(result.build).toBe(buildsMultiArch[1]); // first aarch64
    });

    it('selects correct os and architecture combination', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint(
          [makeRequest({ platform: { os: 'macos', arch: 'aarch64' } })],
          'test'
        ),
      ];
      const result = selectPython(constraints, buildsMultiArch);
      expect(result.build).toBe(buildsMultiArch[2]);
    });
  });

  describe('libc selection', () => {
    const buildsMultiLibc: PythonBuild[] = [
      makeBuild({
        version: { major: 3, minor: 12 },
        os: 'linux',
        libc: 'gnu',
      }),
      makeBuild({
        version: { major: 3, minor: 12 },
        os: 'linux',
        libc: 'musl',
      }),
    ];

    it('selects gnu build', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint([makeRequest({ platform: { libc: 'gnu' } })], 'test'),
      ];
      const result = selectPython(constraints, buildsMultiLibc);
      expect(result.build).toBe(buildsMultiLibc[0]);
    });

    it('selects musl build', () => {
      const constraints: PythonConstraint[] = [
        makeConstraint([makeRequest({ platform: { libc: 'musl' } })], 'test'),
      ];
      const result = selectPython(constraints, buildsMultiLibc);
      expect(result.build).toBe(buildsMultiLibc[1]);
    });
  });
});

describe('PythonImplementation', () => {
  describe('knownLongNames', () => {
    it('returns mapping of long implementation names', () => {
      const names = PythonImplementation.knownLongNames();
      expect(names.python).toBe('cpython');
      expect(names.cpython).toBe('cpython');
      expect(names.pypy).toBe('pypy');
      expect(names.pyodide).toBe('pyodide');
      expect(names.graalpy).toBe('graalpy');
    });
  });

  describe('knownShortNames', () => {
    it('returns mapping of short implementation names', () => {
      const names = PythonImplementation.knownShortNames();
      expect(names.cp).toBe('cpython');
      expect(names.pp).toBe('pypy');
      expect(names.gp).toBe('graalpy');
    });
  });

  describe('knownNames', () => {
    it('returns combined mapping of all known names', () => {
      const names = PythonImplementation.knownNames();
      expect(names.cpython).toBe('cpython');
      expect(names.cp).toBe('cpython');
      expect(names.pypy).toBe('pypy');
      expect(names.pp).toBe('pypy');
    });
  });

  describe('parse', () => {
    it('parses known implementation names', () => {
      expect(PythonImplementation.parse('cpython')).toBe('cpython');
      expect(PythonImplementation.parse('pypy')).toBe('pypy');
      expect(PythonImplementation.parse('cp')).toBe('cpython');
    });

    it('returns unknown implementation object for unrecognized names', () => {
      const result = PythonImplementation.parse('custom');
      expect(result).toEqual({ implementation: 'custom' });
    });
  });

  describe('isUnknown', () => {
    it('returns true for unknown implementations', () => {
      expect(PythonImplementation.isUnknown({ implementation: 'custom' })).toBe(
        true
      );
    });

    it('returns false for known implementations', () => {
      expect(PythonImplementation.isUnknown('cpython')).toBe(false);
      expect(PythonImplementation.isUnknown('pypy')).toBe(false);
    });
  });

  describe('toString', () => {
    it('converts known implementations to string', () => {
      expect(PythonImplementation.toString('cpython')).toBe('cpython');
      expect(PythonImplementation.toString('pypy')).toBe('pypy');
      expect(PythonImplementation.toString('pyodide')).toBe('pyodide');
      expect(PythonImplementation.toString('graalpy')).toBe('graalpy');
    });

    it('converts unknown implementations to string', () => {
      expect(PythonImplementation.toString({ implementation: 'custom' })).toBe(
        'custom'
      );
    });
  });

  describe('toStringPretty', () => {
    it('converts known implementations to pretty string', () => {
      expect(PythonImplementation.toStringPretty('cpython')).toBe('CPython');
      expect(PythonImplementation.toStringPretty('pypy')).toBe('PyPy');
      expect(PythonImplementation.toStringPretty('pyodide')).toBe('PyIodide');
      expect(PythonImplementation.toStringPretty('graalpy')).toBe('GraalPy');
    });

    it('converts unknown implementations to their raw string', () => {
      expect(
        PythonImplementation.toStringPretty({ implementation: 'custom' })
      ).toBe('custom');
    });
  });
});

describe('PythonVariant', () => {
  describe('parse', () => {
    it('parses known variant names', () => {
      expect(PythonVariant.parse('default')).toBe('default');
      expect(PythonVariant.parse('debug')).toBe('debug');
      expect(PythonVariant.parse('d')).toBe('debug');
      expect(PythonVariant.parse('freethreaded')).toBe('freethreaded');
      expect(PythonVariant.parse('t')).toBe('freethreaded');
      expect(PythonVariant.parse('gil')).toBe('gil');
      expect(PythonVariant.parse('freethreaded+debug')).toBe(
        'freethreaded+debug'
      );
      expect(PythonVariant.parse('td')).toBe('freethreaded+debug');
      expect(PythonVariant.parse('gil+debug')).toBe('gil+debug');
    });

    it('returns unknown variant object for unrecognized names', () => {
      const result = PythonVariant.parse('custom');
      expect(result).toEqual({ type: 'unknown', variant: 'custom' });
    });
  });

  describe('toString', () => {
    it('converts known variants to string', () => {
      expect(PythonVariant.toString('default')).toBe('default');
      expect(PythonVariant.toString('debug')).toBe('debug');
      expect(PythonVariant.toString('freethreaded')).toBe('freethreaded');
      expect(PythonVariant.toString('gil')).toBe('gil');
      expect(PythonVariant.toString('freethreaded+debug')).toBe(
        'freethreaded+debug'
      );
      expect(PythonVariant.toString('gil+debug')).toBe('gil+debug');
    });

    it('converts unknown variants to string', () => {
      expect(
        PythonVariant.toString({ type: 'unknown', variant: 'custom' })
      ).toBe('custom');
    });
  });
});

describe('PythonVersion', () => {
  describe('toString', () => {
    it('converts major.minor version to string', () => {
      expect(PythonVersion.toString({ major: 3, minor: 12 })).toBe('3.12');
    });

    it('converts major.minor.patch version to string', () => {
      expect(PythonVersion.toString({ major: 3, minor: 12, patch: 3 })).toBe(
        '3.12.3'
      );
    });

    it('converts version with prerelease to string', () => {
      expect(
        PythonVersion.toString({
          major: 3,
          minor: 13,
          patch: 0,
          prerelease: 'a1',
        })
      ).toBe('3.13.0a1');
    });

    it('handles patch version of 0', () => {
      expect(PythonVersion.toString({ major: 3, minor: 11, patch: 0 })).toBe(
        '3.11.0'
      );
    });
  });
});

describe('PythonBuild', () => {
  describe('toString', () => {
    it('converts build to string representation', () => {
      const build: PythonBuild = {
        implementation: 'cpython',
        version: { major: 3, minor: 12, patch: 3 },
        variant: 'default',
        os: 'linux',
        architecture: 'x86_64',
        libc: 'gnu',
      };
      expect(PythonBuild.toString(build)).toBe(
        'cpython-3.12.3+default-linux-x86_64-gnu'
      );
    });

    it('converts build with freethreaded variant', () => {
      const build: PythonBuild = {
        implementation: 'cpython',
        version: { major: 3, minor: 13 },
        variant: 'freethreaded',
        os: 'macos',
        architecture: 'aarch64',
        libc: 'none',
      };
      expect(PythonBuild.toString(build)).toBe(
        'cpython-3.13+freethreaded-macos-aarch64-none'
      );
    });

    it('converts build with unknown implementation', () => {
      const build: PythonBuild = {
        implementation: { implementation: 'custom' },
        version: { major: 3, minor: 12 },
        variant: 'default',
        os: 'linux',
        architecture: 'x86_64',
        libc: 'gnu',
      };
      expect(PythonBuild.toString(build)).toBe(
        'custom-3.12+default-linux-x86_64-gnu'
      );
    });

    it('converts build with unknown variant', () => {
      const build: PythonBuild = {
        implementation: 'cpython',
        version: { major: 3, minor: 12 },
        variant: { type: 'unknown', variant: 'custom' },
        os: 'linux',
        architecture: 'x86_64',
        libc: 'gnu',
      };
      expect(PythonBuild.toString(build)).toBe(
        'cpython-3.12+custom-linux-x86_64-gnu'
      );
    });
  });
});
