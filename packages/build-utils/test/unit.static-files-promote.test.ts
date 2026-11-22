import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  EMPTY_DISCOVERY,
  copyStaticMounts,
  promoteStaticFiles,
  type StaticDiscovery,
  type StaticMount,
} from '../src/static-files';

// Every source is flattened into one CDN tree, so each path must hold only what
// its highest-priority owner serves, never a file that leaked across a mount
// boundary from a lower-priority source.
describe('copyStaticMounts', () => {
  let root: string;
  let out: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'static-files-copy-'));
    out = path.join(root, 'out');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const source = (name: string, files: Record<string, string>): string => {
    const dir = path.join(root, name);
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return dir;
  };
  const mount = (
    urlPath: string,
    directory: string,
    frontend: boolean
  ): StaticMount => ({
    urlPath,
    directory,
    fallback: null,
    frontend,
    html: false,
  });
  const copy = (mounts: StaticMount[], excludedFiles: string[] = []) =>
    copyStaticMounts({ mounts, excludedFiles }, out);
  const exists = (rel: string): boolean => fs.existsSync(path.join(out, rel));
  const read = (rel: string): string =>
    fs.readFileSync(path.join(out, rel), 'utf8');

  it('does not serve a frontend file from inside a plain mount namespace', async () => {
    const appMount = source('static', { 'a.txt': 'MOUNT_FILE' });
    const frontend = source('frontend', {
      'index.html': '<h1>app</h1>',
      'static/extra.txt': 'FRONTEND_EXTRA',
    });
    await copy([mount('/static', appMount, false), mount('/', frontend, true)]);
    expect(exists('static/a.txt')).toBe(true);
    expect(exists('static/extra.txt')).toBe(false);
  });

  it('does not serve a later mount file from inside an earlier mount namespace', async () => {
    const inner = source('inner', { 'a.txt': 'INNER_FILE' });
    const rootMount = source('rootdir', {
      'root.txt': 'ROOT_FILE',
      'inner/only_root.txt': 'ROOT_ONLY',
    });
    await copy([mount('/inner', inner, false), mount('/', rootMount, false)]);
    expect(exists('inner/a.txt')).toBe(true);
    expect(exists('root.txt')).toBe(true);
    expect(exists('inner/only_root.txt')).toBe(false);
  });

  it('resolves a frontend collision by prefix specificity, not declaration order', async () => {
    const rootFe = source('root-fe', {
      'index.html': '<h1>root</h1>',
      'app/x.txt': 'FROM_ROOT',
    });
    const appFe = source('app-fe', {
      'index.html': '<h1>app</h1>',
      'x.txt': 'FROM_APP',
    });
    await copy([mount('/', rootFe, true), mount('/app', appFe, true)]);
    expect(read('app/x.txt')).toBe('FROM_APP');
  });

  it('does not serve any frontend file once a plain root mount owns the tree', async () => {
    const rootMount = source('rootdir', { 'shared.txt': 'FROM_MOUNT' });
    const frontend = source('frontend', {
      'index.html': '<h1>app</h1>',
      'shared.txt': 'FROM_FRONTEND',
    });
    await copy([mount('/', rootMount, false), mount('/', frontend, true)]);
    expect(read('shared.txt')).toBe('FROM_MOUNT');
    expect(exists('index.html')).toBe(false);
  });

  it('skips excluded files so the Lambda serves them', async () => {
    const dir = source('static', { 'logo.png': 'LOGO', 'a.txt': 'A' });
    await copy([mount('/static', dir, false)], ['/static/logo.png']);
    expect(exists('static/a.txt')).toBe(true);
    expect(exists('static/logo.png')).toBe(false);
  });

  it('returns only the copied mounts when one fails', async () => {
    const good = source('good', { 'a.txt': 'GOOD' });
    const missing = path.join(root, 'does-not-exist');
    const copied = await copy([
      mount('/missing', missing, false),
      mount('/good', good, false),
    ]);
    expect(copied.map(m => m.urlPath)).toEqual(['/good']);
    expect(read('good/a.txt')).toBe('GOOD');
    expect(exists('missing/a.txt')).toBe(false);
  });

  it('keeps a failed mount namespace closed to lower-priority mounts', async () => {
    const rootMount = source('rootdir', { 'missing/leak.txt': 'LEAK' });
    await copy([
      mount('/missing', path.join(root, 'does-not-exist'), false),
      mount('/', rootMount, false),
    ]);
    expect(exists('missing/leak.txt')).toBe(false);
  });

  it('returns an empty set when every mount fails', async () => {
    const copied = await copy([
      mount('/a', path.join(root, 'no-a'), false),
      mount('/b', path.join(root, 'no-b'), false),
    ]);
    expect(copied).toEqual([]);
  });
});

describe('promoteStaticFiles', () => {
  let root: string;
  let out: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'static-files-promote-'));
    out = path.join(root, 'out');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const mount = (urlPath: string, directory: string): StaticMount => ({
    urlPath,
    directory,
    fallback: { file: 'index.html', status: 200 },
    frontend: false,
    html: false,
  });

  it('returns null when nothing is discovered', async () => {
    expect(await promoteStaticFiles(EMPTY_DISCOVERY, out)).toBeNull();
    expect(fs.existsSync(out)).toBe(false);
  });

  it('returns null when no mount could be copied', async () => {
    const discovery: StaticDiscovery = {
      mounts: [mount('/a', path.join(root, 'missing'))],
      shadowRoutes: [],
      excludedFiles: [],
    };
    expect(await promoteStaticFiles(discovery, out)).toBeNull();
  });

  it('keeps the full discovery alongside the mounts actually copied', async () => {
    const good = path.join(root, 'good');
    fs.mkdirSync(good);
    fs.writeFileSync(path.join(good, 'index.html'), '');
    const failed = mount('/failed', path.join(root, 'missing'));
    const discovery: StaticDiscovery = {
      mounts: [failed, mount('/good', good)],
      shadowRoutes: [{ body: 'api', methods: null }],
      excludedFiles: [],
    };
    const result = await promoteStaticFiles(discovery, out);
    expect(result).toEqual({
      discovery,
      copiedMounts: [discovery.mounts[1]],
      outputStaticDir: out,
    });
    expect(fs.existsSync(path.join(out, 'good/index.html'))).toBe(true);
  });
});
