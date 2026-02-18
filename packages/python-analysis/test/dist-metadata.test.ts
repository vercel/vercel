import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { scanDistributions } from '../src';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'dist-metadata-site-packages');

describe('scanDistributions', () => {
  it('scans fixture site-packages and finds all distributions', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    expect(index.size).toBe(4);
    expect(index.has('flask')).toBe(true);
    expect(index.has('requests')).toBe(true);
    expect(index.has('my-editable-pkg')).toBe(true);
    expect(index.has('mylib')).toBe(true);
  });

  it('parses Flask metadata correctly', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;

    expect(flask.name).toBe('flask');
    expect(flask.version).toBe('3.0.0');
    expect(flask.metadataVersion).toBe('2.3');
    expect(flask.summary).toBe(
      'A simple framework for building complex web applications.'
    );
    expect(flask.requiresPython).toBe('>=3.8');
    expect(flask.license).toBe('BSD-3-Clause');
    expect(flask.authorEmail).toBe('Pallets <contact@palletsprojects.com>');
    expect(flask.homePage).toBe('https://flask.palletsprojects.com');
    expect(flask.installer).toBe('uv');
  });

  it('parses requires-dist correctly', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;

    expect(flask.requiresDist).toContain('Werkzeug>=3.0.0');
    expect(flask.requiresDist).toContain('Jinja2>=3.1.2');
    expect(flask.requiresDist).toContain('click>=8.1.3');
    expect(flask.requiresDist.length).toBe(8);
  });

  it('parses provides-extra correctly', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;

    expect(flask.providesExtra).toContain('async');
    expect(flask.providesExtra).toContain('dotenv');
    expect(flask.providesExtra.length).toBe(2);
  });

  it('parses classifiers correctly', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;

    expect(flask.classifiers).toContain('Framework :: Flask');
    expect(flask.classifiers.length).toBe(4);
  });

  it('parses project URLs correctly', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;

    expect(flask.projectUrls.length).toBe(3);
    const urlMap = Object.fromEntries(flask.projectUrls);
    expect(urlMap['Documentation']).toBe('https://flask.palletsprojects.com/');
    expect(urlMap['Source']).toBe('https://github.com/pallets/flask/');
  });

  it('parses RECORD files correctly', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;

    expect(flask.files.length).toBe(5);

    const initFile = flask.files.find(f => f.path === 'flask/__init__.py');
    expect(initFile).toBeDefined();
    expect(initFile!.hash).toBe(
      'sha256=rJY6MEKvkWlSNzu1rz1r21xjMBCslQ1kP0mFpSPfEp0'
    );
    expect(initFile!.size).toBe(3694n);

    // RECORD entry for itself has no hash or size
    const recordFile = flask.files.find(
      f => f.path === 'flask-3.0.0.dist-info/RECORD'
    );
    expect(recordFile).toBeDefined();
    expect(recordFile!.hash).toBeUndefined();
    expect(recordFile!.size).toBeUndefined();
  });

  it('parses requests metadata with maintainer fields', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const requests = index.get('requests')!;

    expect(requests.name).toBe('requests');
    expect(requests.version).toBe('2.31.0');
    expect(requests.author).toBe('Kenneth Reitz');
    expect(requests.authorEmail).toBe('me@kennethreitz.org');
    expect(requests.maintainer).toBe('Seth Michael Larson');
    expect(requests.maintainerEmail).toBe('sethmichaellarson@gmail.com');
    expect(requests.installer).toBe('pip');
  });

  it('parses local directory direct_url.json (editable install)', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const pkg = index.get('my-editable-pkg')!;

    const origin = pkg.origin!;
    expect(origin.tag).toBe('local-directory');
    if (origin.tag === 'local-directory') {
      expect(origin.val.url).toBe('file:///home/user/projects/my-editable-pkg');
      expect(origin.val.editable).toBe(true);
    }
  });

  it('parses VCS direct_url.json', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const pkg = index.get('mylib')!;

    const origin = pkg.origin!;
    expect(origin.tag).toBe('vcs');
    if (origin.tag === 'vcs') {
      expect(origin.val.url).toBe('https://github.com/example/mylib.git');
      expect(origin.val.vcs).toBe('git');
      expect(origin.val.commitId).toBe('abc123def456');
      expect(origin.val.requestedRevision).toBe('main');
    }
  });

  it('normalizes package names (PEP 503)', async () => {
    const index = await scanDistributions(FIXTURES_DIR);

    // my_editable_pkg is normalized to my-editable-pkg
    expect(index.has('my-editable-pkg')).toBe(true);
    expect(index.has('my_editable_pkg')).toBe(false);
  });

  it('returns empty map for non-existent directory', async () => {
    const index = await scanDistributions('/nonexistent/path');
    expect(index.size).toBe(0);
  });

  it('returns empty map for directory with no .dist-info', async () => {
    const index = await scanDistributions(__dirname);
    expect(index.size).toBe(0);
  });

  it('packages without origin have undefined origin field', async () => {
    const index = await scanDistributions(FIXTURES_DIR);
    const flask = index.get('flask')!;
    expect(flask.origin).toBeUndefined();
  });
});
