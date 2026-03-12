import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extendDistRecord, scanDistributions } from '../src';

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

describe('extendDistRecord', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(
      tmpdir(),
      `vc-test-dist-record-${Math.floor(Math.random() * 1e6)}`
    );
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupDistInfo(
    name: string,
    version: string,
    recordContent: string
  ) {
    const distInfoDir = join(tmpDir, `${name}-${version}.dist-info`);
    await mkdir(distInfoDir, { recursive: true });
    await writeFile(join(distInfoDir, 'RECORD'), recordContent);
    return distInfoDir;
  }

  /** Create a file under tmpDir and return its expected RECORD entry. */
  async function createFile(relPath: string, content: string): Promise<string> {
    const fullPath = join(tmpDir, relPath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    const buf = Buffer.from(content);
    await writeFile(fullPath, buf);
    const hash = createHash('sha256').update(buf).digest('base64url');
    return `${relPath},sha256=${hash},${buf.length}`;
  }

  it('appends new entries with sha256 and size to RECORD', async () => {
    await setupDistInfo('mypkg', '1.0.0', 'mypkg/__init__.py,,\n');
    const entry1 = await createFile('mypkg/data/file1.bin', 'content1');
    const entry2 = await createFile('mypkg/data/file2.bin', 'content2');

    const count = await extendDistRecord(tmpDir, 'mypkg', [
      'mypkg/data/file1.bin',
      'mypkg/data/file2.bin',
    ]);

    expect(count).toBe(2);
    const record = await readFile(
      join(tmpDir, 'mypkg-1.0.0.dist-info', 'RECORD'),
      'utf-8'
    );
    expect(record).toContain(entry1);
    expect(record).toContain(entry2);
  });

  it('skips paths already in RECORD', async () => {
    await setupDistInfo(
      'mypkg',
      '1.0.0',
      'mypkg/__init__.py,,\nmypkg/existing.py,,\n'
    );
    await createFile('mypkg/__init__.py', '');
    await createFile('mypkg/existing.py', '');
    const newEntry = await createFile('mypkg/new.py', 'new content');

    const count = await extendDistRecord(tmpDir, 'mypkg', [
      'mypkg/__init__.py',
      'mypkg/existing.py',
      'mypkg/new.py',
    ]);

    expect(count).toBe(1);
    const record = await readFile(
      join(tmpDir, 'mypkg-1.0.0.dist-info', 'RECORD'),
      'utf-8'
    );
    expect(record).toContain(newEntry);
  });

  it('returns 0 when all paths are already tracked', async () => {
    await setupDistInfo('mypkg', '1.0.0', 'mypkg/__init__.py,,\n');
    await createFile('mypkg/__init__.py', '');

    const count = await extendDistRecord(tmpDir, 'mypkg', [
      'mypkg/__init__.py',
    ]);

    expect(count).toBe(0);
  });

  it('matches package name using PEP 503 normalization', async () => {
    await setupDistInfo('My_Package', '2.0.0', 'my_package/__init__.py,,\n');
    await createFile('my_package/extra.py', 'extra');

    const count = await extendDistRecord(tmpDir, 'my-package', [
      'my_package/extra.py',
    ]);

    expect(count).toBe(1);
  });

  it('throws when dist-info directory is not found', async () => {
    await expect(
      extendDistRecord(tmpDir, 'nonexistent', ['some/file.py'])
    ).rejects.toThrow(/No .dist-info directory found/);
  });

  it('throws when RECORD file is missing', async () => {
    const distInfoDir = join(tmpDir, 'mypkg-1.0.0.dist-info');
    await mkdir(distInfoDir, { recursive: true });
    // No RECORD file written

    await expect(
      extendDistRecord(tmpDir, 'mypkg', ['mypkg/file.py'])
    ).rejects.toThrow(/RECORD file not found/);
  });

  it('handles RECORD without trailing newline', async () => {
    await setupDistInfo('mypkg', '1.0.0', 'mypkg/__init__.py,,');
    const newEntry = await createFile('mypkg/new.py', 'new');

    const count = await extendDistRecord(tmpDir, 'mypkg', ['mypkg/new.py']);

    expect(count).toBe(1);
    const record = await readFile(
      join(tmpDir, 'mypkg-1.0.0.dist-info', 'RECORD'),
      'utf-8'
    );
    // The existing last line must not be corrupted
    expect(record).toContain('mypkg/__init__.py,,\n');
    expect(record).toContain(newEntry + '\n');
  });

  it('handles empty paths array', async () => {
    await setupDistInfo('mypkg', '1.0.0', 'mypkg/__init__.py,,\n');
    await createFile('mypkg/__init__.py', '');

    const count = await extendDistRecord(tmpDir, 'mypkg', []);

    expect(count).toBe(0);
  });
});
