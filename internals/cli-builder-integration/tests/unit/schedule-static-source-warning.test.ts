import { describe, expect, it } from 'vitest';
import type { Builder } from '@vercel/build-utils';

import {
  getPublishedPythonSources,
  getPublishedPythonSourcesWarning,
} from '../../src/schedule-static-source-warning';

const files = [
  'index.html',
  'jobs/_db.py',
  'jobs/nightly.py',
  'pyproject.toml',
  'web/app.py',
  'web/package.json',
];

// Mirrors the zero-config static fallback, which excludes platform files and
// claimed schedule entrypoints.
const staticFallback: Builder = {
  use: '@vercel/static',
  src: '!{api/**,package.json,jobs/nightly.py}',
  config: { zeroConfig: true },
};

describe('getPublishedPythonSources', () => {
  it('returns Python files the zero-config static fallback publishes', () => {
    expect(getPublishedPythonSources([staticFallback], files)).toEqual([
      'jobs/_db.py',
      'web/app.py',
    ]);
  });

  it('ignores the zero-config public directory builder', () => {
    const publicBuilder: Builder = {
      use: '@vercel/static',
      src: 'public/**/*',
      config: { zeroConfig: true, outputDirectory: 'public' },
    };
    expect(
      getPublishedPythonSources([publicBuilder], [...files, 'public/demo.py'])
    ).toEqual([]);
  });

  it('returns every Python file under a static-build output directory of "."', () => {
    const staticBuild: Builder = {
      use: '@vercel/static-build',
      src: 'package.json',
      config: { zeroConfig: true, outputDirectory: '.' },
    };
    expect(getPublishedPythonSources([staticBuild], files)).toEqual([
      'jobs/_db.py',
      'jobs/nightly.py',
      'web/app.py',
    ]);
  });

  it('scopes a nested static-build output directory of "." to its entrypoint', () => {
    const staticBuild: Builder = {
      use: '@vercel/static-build',
      src: 'web/package.json',
      config: { distDir: '.' },
    };
    expect(getPublishedPythonSources([staticBuild], files)).toEqual([
      'web/app.py',
    ]);
  });

  it('ignores static-build output directories other than "."', () => {
    const staticBuild: Builder = {
      use: '@vercel/static-build',
      src: 'package.json',
      config: { zeroConfig: true, outputDirectory: 'dist' },
    };
    expect(getPublishedPythonSources([staticBuild], files)).toEqual([]);
  });

  it('ignores non-static builders', () => {
    const python: Builder = { use: '@vercel/python', src: 'jobs/_db.py' };
    expect(getPublishedPythonSources([python], files)).toEqual([]);
  });

  it('lists a file published by several builders once', () => {
    const explicitStatic: Builder = {
      use: '@vercel/static',
      src: 'jobs/_db.py',
    };
    expect(
      getPublishedPythonSources([staticFallback, explicitStatic], files)
    ).toEqual(['jobs/_db.py', 'web/app.py']);
  });
});

describe('getPublishedPythonSourcesWarning', () => {
  it('names a single file', () => {
    expect(getPublishedPythonSourcesWarning(['jobs/_db.py'])).toBe(
      '1 Python file is published as a static file and can be downloaded: jobs/_db.py. To keep it private, set `outputDirectory` to a directory that only contains static files.'
    );
  });

  it('lists up to 3 files and counts the rest', () => {
    expect(
      getPublishedPythonSourcesWarning(['a.py', 'b.py', 'c.py', 'd.py', 'e.py'])
    ).toBe(
      '5 Python files are published as static files and can be downloaded: a.py, b.py, c.py, and 2 more. To keep them private, set `outputDirectory` to a directory that only contains static files.'
    );
  });

  it('joins 2 files without a list comma', () => {
    expect(getPublishedPythonSourcesWarning(['a.py', 'b.py'])).toContain(
      'downloaded: a.py and b.py.'
    );
  });
});
