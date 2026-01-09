import {
  convertPipfileToPyprojectToml,
  convertPipfileLockToPyprojectToml,
} from '../src/manifest/pipfile-parser';
import type {
  PipfileLike,
  PipfileLockLike,
} from '../src/manifest/pipfile/types';

describe('convertPipfileToPyprojectToml', () => {
  it('converts simple packages to dependencies', () => {
    const pipfile: PipfileLike = {
      packages: {
        flask: '>=2.0.0',
        requests: '==2.28.0',
        django: '*',
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual([
      'flask>=2.0.0',
      'requests==2.28.0',
      'django',
    ]);
  });

  it('converts dev-packages to dependency-groups.dev', () => {
    const pipfile: PipfileLike = {
      packages: {
        flask: '>=2.0.0',
      },
      'dev-packages': {
        pytest: '>=7.0.0',
        black: '==23.0.0',
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual(['flask>=2.0.0']);
    expect(result['dependency-groups']?.dev).toEqual([
      'pytest>=7.0.0',
      'black==23.0.0',
    ]);
  });

  it('handles packages with extras in name', () => {
    const pipfile: PipfileLike = {
      packages: {
        'requests[security,socks]': '>=2.28.0',
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual([
      'requests[security,socks]>=2.28.0',
    ]);
  });

  it('handles packages with extras in detail object', () => {
    const pipfile: PipfileLike = {
      packages: {
        requests: {
          version: '>=2.28.0',
          extras: ['security', 'socks'],
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual([
      'requests[security,socks]>=2.28.0',
    ]);
  });

  it('handles packages with markers', () => {
    const pipfile: PipfileLike = {
      packages: {
        pywin32: {
          version: '>=300',
          markers: "sys_platform == 'win32'",
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual([
      "pywin32>=300 ; sys_platform == 'win32'",
    ]);
  });

  it('converts git dependencies to tool.uv.sources', () => {
    const pipfile: PipfileLike = {
      packages: {
        mypackage: {
          git: 'https://github.com/user/repo.git',
          ref: 'v1.0.0',
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual(['mypackage']);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
          rev: 'v1.0.0',
        },
      ],
    });
  });

  it('converts git dependencies without ref', () => {
    const pipfile: PipfileLike = {
      packages: {
        mypackage: {
          git: 'https://github.com/user/repo.git',
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
        },
      ],
    });
  });

  it('converts path dependencies to tool.uv.sources', () => {
    const pipfile: PipfileLike = {
      packages: {
        mypackage: {
          path: './local/package',
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual(['mypackage']);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          path: './local/package',
        },
      ],
    });
  });

  it('converts editable path dependencies', () => {
    const pipfile: PipfileLike = {
      packages: {
        mypackage: {
          path: './local/package',
          editable: true,
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          path: './local/package',
          editable: true,
        },
      ],
    });
  });

  it('converts custom index sources to tool.uv.index', () => {
    const pipfile: PipfileLike = {
      packages: {
        flask: '>=2.0.0',
      },
      source: [
        {
          name: 'pypi',
          url: 'https://pypi.org/simple',
          verify_ssl: true,
        },
        {
          name: 'private',
          url: 'https://private.pypi.org/simple/',
          verify_ssl: true,
        },
      ],
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'private',
        url: 'https://private.pypi.org/simple/',
        explicit: true,
      },
    ]);
  });

  it('converts single non-pypi source without explicit flag', () => {
    const pipfile: PipfileLike = {
      packages: {
        flask: '>=2.0.0',
      },
      source: [
        {
          name: 'private',
          url: 'https://private.pypi.org/simple/',
        },
      ],
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'private',
        url: 'https://private.pypi.org/simple/',
      },
    ]);
  });

  it('handles packages with custom index', () => {
    const pipfile: PipfileLike = {
      packages: {
        'private-package': {
          version: '>=1.0.0',
          index: 'private',
        },
      },
      source: [
        {
          name: 'pypi',
          url: 'https://pypi.org/simple',
        },
        {
          name: 'private',
          url: 'https://private.pypi.org/simple/',
        },
      ],
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual(['private-package>=1.0.0']);
    expect(result.tool?.uv?.sources).toEqual({
      'private-package': [
        {
          index: 'private',
        },
      ],
    });
  });

  it('skips pypi index in sources', () => {
    const pipfile: PipfileLike = {
      packages: {
        'some-package': {
          version: '>=1.0.0',
          index: 'pypi',
        },
      },
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result.project?.dependencies).toEqual(['some-package>=1.0.0']);
    expect(result.tool?.uv?.sources).toBeUndefined();
  });

  it('returns empty object for empty Pipfile', () => {
    const pipfile: PipfileLike = {};
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result).toEqual({});
  });

  it('returns empty object for Pipfile with only empty packages', () => {
    const pipfile: PipfileLike = {
      packages: {},
      'dev-packages': {},
    };
    const result = convertPipfileToPyprojectToml(pipfile);
    expect(result).toEqual({});
  });

  it('handles complex Pipfile with all features', () => {
    const pipfile: PipfileLike = {
      packages: {
        flask: '>=2.0.0',
        'requests[security]': '==2.28.0',
        mypackage: {
          git: 'https://github.com/user/repo.git',
          ref: 'main',
        },
        locallib: {
          path: './libs/locallib',
          editable: true,
        },
      },
      'dev-packages': {
        pytest: '>=7.0.0',
        black: {
          version: '==23.0.0',
          markers: "python_version >= '3.8'",
        },
      },
      source: [
        {
          name: 'pypi',
          url: 'https://pypi.org/simple',
        },
        {
          name: 'private',
          url: 'https://private.pypi.org/simple/',
        },
      ],
    };
    const result = convertPipfileToPyprojectToml(pipfile);

    expect(result.project?.dependencies).toEqual([
      'flask>=2.0.0',
      'requests[security]==2.28.0',
      'mypackage',
      'locallib',
    ]);
    expect(result['dependency-groups']?.dev).toEqual([
      'pytest>=7.0.0',
      "black==23.0.0 ; python_version >= '3.8'",
    ]);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'private',
        url: 'https://private.pypi.org/simple/',
        explicit: true,
      },
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
          rev: 'main',
        },
      ],
      locallib: [
        {
          path: './libs/locallib',
          editable: true,
        },
      ],
    });
  });
});

describe('convertPipfileLockToPyprojectToml', () => {
  it('converts default packages to dependencies', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        flask: { version: '==2.3.0' },
        requests: { version: '==2.28.0' },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual([
      'flask==2.3.0',
      'requests==2.28.0',
    ]);
  });

  it('converts develop packages to dependency-groups.dev', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        flask: { version: '==2.3.0' },
      },
      develop: {
        pytest: { version: '==7.4.0' },
        black: { version: '==23.7.0' },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual(['flask==2.3.0']);
    expect(result['dependency-groups']?.dev).toEqual([
      'pytest==7.4.0',
      'black==23.7.0',
    ]);
  });

  it('handles packages with extras', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        requests: {
          version: '==2.28.0',
          extras: ['security', 'socks'],
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual([
      'requests[security,socks]==2.28.0',
    ]);
  });

  it('handles packages with string extras', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        requests: {
          version: '==2.28.0',
          extras: 'security',
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual([
      'requests[security]==2.28.0',
    ]);
  });

  it('handles packages with markers', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        pywin32: {
          version: '==306',
          markers: "sys_platform == 'win32'",
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual([
      "pywin32==306 ; sys_platform == 'win32'",
    ]);
  });

  it('converts git dependencies to tool.uv.sources', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        mypackage: {
          git: 'https://github.com/user/repo.git',
          ref: 'abc123def',
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual(['mypackage']);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
          rev: 'abc123def',
        },
      ],
    });
  });

  it('converts path dependencies to tool.uv.sources', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        mypackage: {
          path: './local/package',
          editable: true,
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          path: './local/package',
          editable: true,
        },
      ],
    });
  });

  it('converts sources from _meta to tool.uv.index', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {
        sources: [
          {
            name: 'pypi',
            url: 'https://pypi.org/simple',
            verify_ssl: true,
          },
          {
            name: 'private',
            url: 'https://private.pypi.org/simple/',
            verify_ssl: true,
          },
        ],
      },
      default: {
        flask: { version: '==2.3.0' },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'private',
        url: 'https://private.pypi.org/simple/',
        explicit: true,
      },
    ]);
  });

  it('handles packages with custom index', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {
        sources: [
          {
            name: 'pypi',
            url: 'https://pypi.org/simple',
          },
          {
            name: 'private',
            url: 'https://private.pypi.org/simple/',
          },
        ],
      },
      default: {
        'private-package': {
          version: '==1.2.3',
          index: 'private',
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual(['private-package==1.2.3']);
    expect(result.tool?.uv?.sources).toEqual({
      'private-package': [
        {
          index: 'private',
        },
      ],
    });
  });

  it('handles custom categories', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        flask: { version: '==2.3.0' },
      },
      develop: {
        pytest: { version: '==7.4.0' },
      },
      docs: {
        sphinx: { version: '==7.0.0' },
        'sphinx-rtd-theme': { version: '==1.3.0' },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual(['flask==2.3.0']);
    expect(result['dependency-groups']?.dev).toEqual(['pytest==7.4.0']);
    expect(result['dependency-groups']?.docs).toEqual([
      'sphinx==7.0.0',
      'sphinx-rtd-theme==1.3.0',
    ]);
  });

  it('returns empty object for empty Pipfile.lock', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result).toEqual({});
  });

  it('returns empty object for Pipfile.lock with only empty sections', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {},
      develop: {},
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result).toEqual({});
  });

  it('handles complex Pipfile.lock with all features', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {
        hash: {
          sha256: 'abc123',
        },
        'pipfile-spec': 6,
        requires: {
          python_version: '3.11',
        },
        sources: [
          {
            name: 'pypi',
            url: 'https://pypi.org/simple',
            verify_ssl: true,
          },
          {
            name: 'private',
            url: 'https://private.pypi.org/simple/',
            verify_ssl: true,
          },
        ],
      },
      default: {
        flask: { version: '==2.3.0' },
        'requests[security]': { version: '==2.28.0' },
        mypackage: {
          git: 'https://github.com/user/repo.git',
          ref: 'abc123',
        },
        'private-pkg': {
          version: '==1.0.0',
          index: 'private',
        },
      },
      develop: {
        pytest: { version: '==7.4.0' },
        black: {
          version: '==23.7.0',
          markers: "python_version >= '3.8'",
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);

    expect(result.project?.dependencies).toEqual([
      'flask==2.3.0',
      'requests[security]==2.28.0',
      'mypackage',
      'private-pkg==1.0.0',
    ]);
    expect(result['dependency-groups']?.dev).toEqual([
      'pytest==7.4.0',
      "black==23.7.0 ; python_version >= '3.8'",
    ]);
    expect(result.tool?.uv?.index).toEqual([
      {
        name: 'private',
        url: 'https://private.pypi.org/simple/',
        explicit: true,
      },
    ]);
    expect(result.tool?.uv?.sources).toEqual({
      mypackage: [
        {
          git: 'https://github.com/user/repo.git',
          rev: 'abc123',
        },
      ],
      'private-pkg': [
        {
          index: 'private',
        },
      ],
    });
  });

  it('merges extras from name and properties', () => {
    const pipfileLock: PipfileLockLike = {
      _meta: {},
      default: {
        'requests[security]': {
          version: '==2.28.0',
          extras: ['socks'],
        },
      },
    };
    const result = convertPipfileLockToPyprojectToml(pipfileLock);
    expect(result.project?.dependencies).toEqual([
      'requests[security,socks]==2.28.0',
    ]);
  });
});
