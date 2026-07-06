import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';
import {
  mkdtempSync,
  removeSync,
  readJSONSync,
  writeJSONSync,
  mkdirpSync,
  writeFileSync,
  existsSync,
} from 'fs-extra';
import tar from 'tar-fs';
import {
  STORE_FORMAT,
  readPointer,
  writePointer,
  verifyIntegrity,
  extractTarball,
  shouldRedirectToStore,
  shouldSeedStore,
  shouldAttemptSeed,
  recordSeedAttempt,
  getVersionDir,
  getStoreEntrypoint,
  isConfidentlyGlobal,
} from '../../../src/util/cli-store';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vc-store-test-'));
});

afterEach(() => {
  removeSync(root);
});

describe('cli-store pointer', () => {
  it('round-trips a valid pointer', () => {
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
      root
    );
    expect(readPointer(root)).toEqual({
      storeFormat: STORE_FORMAT,
      version: '54.19.0',
      type: 'npm',
    });
  });

  it('returns undefined when the pointer is missing', () => {
    expect(readPointer(root)).toBeUndefined();
  });

  it('returns undefined for a malformed pointer file', () => {
    mkdirpSync(root);
    writeFileSync(join(root, 'current.json'), 'not json');
    expect(readPointer(root)).toBeUndefined();
  });

  it('returns undefined for an unknown store format', () => {
    // A shim that does not understand a future store format must behave as
    // if the store does not exist.
    writeJSONSync(join(root, 'current.json'), {
      storeFormat: STORE_FORMAT + 1,
      version: '99.0.0',
      type: 'npm',
    });
    expect(readPointer(root)).toBeUndefined();
  });

  it('accepts the native payload type', () => {
    writeJSONSync(join(root, 'current.json'), {
      storeFormat: STORE_FORMAT,
      version: '54.19.0',
      type: 'native',
    });
    expect(readPointer(root)?.type).toBe('native');
  });

  it('returns undefined for an unknown payload type', () => {
    writeJSONSync(join(root, 'current.json'), {
      storeFormat: STORE_FORMAT,
      version: '54.19.0',
      type: 'wasm',
    });
    expect(readPointer(root)).toBeUndefined();
  });

  it('returns undefined for an invalid version', () => {
    writeJSONSync(join(root, 'current.json'), {
      storeFormat: STORE_FORMAT,
      version: 'latest',
      type: 'npm',
    });
    expect(readPointer(root)).toBeUndefined();
  });

  it('is monotonic: a lower version cannot overwrite a higher one', () => {
    writePointer(
      { storeFormat: STORE_FORMAT, version: '2.0.0', type: 'npm' },
      root
    );
    // A slow background seed of an older version must not undo an upgrade.
    writePointer(
      { storeFormat: STORE_FORMAT, version: '1.0.0', type: 'npm' },
      root
    );
    expect(readPointer(root)?.version).toBe('2.0.0');

    // Equal versions are also no-ops; higher versions win.
    writePointer(
      { storeFormat: STORE_FORMAT, version: '3.0.0', type: 'npm' },
      root
    );
    expect(readPointer(root)?.version).toBe('3.0.0');
  });

  it('does not leave temp files behind after writing', () => {
    writePointer(
      { storeFormat: STORE_FORMAT, version: '1.2.3', type: 'npm' },
      root
    );
    const leftovers = require('fs')
      .readdirSync(root)
      .filter((f: string) => f.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});

describe('verifyIntegrity', () => {
  const content = Buffer.from('hello vercel');
  const contentBytes = Uint8Array.from(content);

  it('accepts a matching sha512 SRI string', () => {
    const integrity = `sha512-${createHash('sha512').update(contentBytes).digest('base64')}`;
    expect(verifyIntegrity(content, { integrity })).toBe(true);
  });

  it('rejects a non-matching sha512 SRI string', () => {
    const integrity = `sha512-${createHash('sha512').update('tampered').digest('base64')}`;
    expect(verifyIntegrity(content, { integrity })).toBe(false);
  });

  it('accepts a matching legacy shasum when integrity is absent', () => {
    const shasum = createHash('sha1').update(contentBytes).digest('hex');
    expect(verifyIntegrity(content, { shasum })).toBe(true);
  });

  it('rejects when neither integrity nor shasum is provided', () => {
    expect(verifyIntegrity(content, {})).toBe(false);
  });

  it('rejects unsupported or malformed algorithms', () => {
    expect(verifyIntegrity(content, { integrity: 'md5-abcdef' })).toBe(false);
    expect(verifyIntegrity(content, { integrity: 'garbage' })).toBe(false);
  });
});

async function makeNpmTarball(files: Record<string, string>): Promise<Buffer> {
  // Lay the files out under a package/ prefix (npm tarball convention) in a
  // temp dir, then pack it with tar-fs.
  const srcDir = mkdtempSync(join(tmpdir(), 'vc-store-tarball-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const filePath = join(srcDir, 'package', name);
      mkdirpSync(join(filePath, '..'));
      writeFileSync(filePath, contents);
    }
    const chunks: Uint8Array[] = [];
    await new Promise<void>((resolve, reject) => {
      tar
        .pack(srcDir)
        .on('data', (chunk: Buffer) => chunks.push(Uint8Array.from(chunk)))
        .on('error', reject)
        .on('end', () => resolve());
    });
    return gzipSync(Uint8Array.from(Buffer.concat(chunks)));
  } finally {
    removeSync(srcDir);
  }
}

describe('extractTarball', () => {
  it('strips the package/ prefix and writes files', async () => {
    const tarball = await makeNpmTarball({
      'package.json': JSON.stringify({ name: 'vercel', version: '9.9.9' }),
      'dist/vc.js': '// entry',
    });
    const dest = join(root, 'out');
    await extractTarball(tarball, dest);
    expect(readJSONSync(join(dest, 'package.json')).version).toBe('9.9.9');
    expect(existsSync(join(dest, 'dist', 'vc.js'))).toBe(true);
  });

  it('rejects on corrupt gzip data', async () => {
    await expect(
      extractTarball(Buffer.from('definitely not gzip'), join(root, 'out'))
    ).rejects.toThrow();
  });
});

describe('isConfidentlyGlobal', () => {
  const originalPnpmHome = process.env.PNPM_HOME;

  afterEach(() => {
    if (originalPnpmHome === undefined) {
      delete process.env.PNPM_HOME;
    } else {
      process.env.PNPM_HOME = originalPnpmHome;
    }
  });

  it('accepts an npm-global-shaped install (node_modules, no lockfile above)', () => {
    delete process.env.PNPM_HOME;
    const dir = join(root, 'lib', 'node_modules', 'vercel');
    mkdirpSync(dir);
    expect(isConfidentlyGlobal(dir)).toBe(true);
  });

  it('rejects a project-shaped install (lockfile above node_modules)', () => {
    delete process.env.PNPM_HOME;
    const dir = join(root, 'my-app', 'node_modules', 'vercel');
    mkdirpSync(dir);
    writeFileSync(join(root, 'my-app', 'package-lock.json'), '{}');
    expect(isConfidentlyGlobal(dir)).toBe(false);
  });

  it('accepts anything under PNPM_HOME even with a lockfile present', () => {
    // pnpm 11 isolated globals carry their own pnpm-lock.yaml; PNPM_HOME
    // containment must take precedence over the lockfile heuristic.
    process.env.PNPM_HOME = join(root, 'pnpm-home');
    const dir = join(
      root,
      'pnpm-home',
      'global',
      'v11',
      'hash',
      'node_modules',
      'vercel'
    );
    mkdirpSync(dir);
    writeFileSync(
      join(root, 'pnpm-home', 'global', 'v11', 'hash', 'pnpm-lock.yaml'),
      ''
    );
    expect(isConfidentlyGlobal(dir)).toBe(true);
  });

  it('rejects paths not under any node_modules (ambiguous)', () => {
    delete process.env.PNPM_HOME;
    const dir = join(root, 'some', 'random', 'place');
    mkdirpSync(dir);
    expect(isConfidentlyGlobal(dir)).toBe(false);
  });
});

describe('self-seeding', () => {
  it('shouldSeedStore is true when there is no store', () => {
    expect(shouldSeedStore('54.19.0', root)).toBe(true);
  });

  it('shouldSeedStore is true when the pointer is older', () => {
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.18.0', type: 'npm' },
      root
    );
    expect(shouldSeedStore('54.19.0', root)).toBe(true);
  });

  it('shouldSeedStore is false when the pointer is equal or newer', () => {
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
      root
    );
    expect(shouldSeedStore('54.19.0', root)).toBe(false);
    expect(shouldSeedStore('54.18.0', root)).toBe(false);
  });

  it('shouldSeedStore is false for invalid running versions', () => {
    expect(shouldSeedStore('not-a-version', root)).toBe(false);
  });

  it('rate-limits seed attempts per version', () => {
    expect(shouldAttemptSeed('54.19.0', root)).toBe(true);
    recordSeedAttempt('54.19.0', root);
    // Same version within the retry window: no retry.
    expect(shouldAttemptSeed('54.19.0', root)).toBe(false);
    // A different version is a fresh attempt.
    expect(shouldAttemptSeed('54.20.0', root)).toBe(true);
  });
});

describe('shouldRedirectToStore', () => {
  function seedVersion(version: string) {
    const dir = getVersionDir(version, root);
    mkdirpSync(join(dir, 'dist'));
    writeFileSync(getStoreEntrypoint(version, root), '// entry');
    writeJSONSync(join(dir, 'package.json'), { name: 'vercel', version });
  }

  it('redirects when the store holds a newer version', () => {
    seedVersion('54.19.0');
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
      root
    );
    expect(shouldRedirectToStore('54.18.0', root)?.version).toBe('54.19.0');
  });

  it('does not redirect when the store version equals the running version', () => {
    seedVersion('54.18.0');
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.18.0', type: 'npm' },
      root
    );
    expect(shouldRedirectToStore('54.18.0', root)).toBeUndefined();
  });

  it('does not redirect when the store version is older', () => {
    seedVersion('54.17.0');
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.17.0', type: 'npm' },
      root
    );
    expect(shouldRedirectToStore('54.18.0', root)).toBeUndefined();
  });

  it('does not redirect when the pointed version directory is missing', () => {
    // Pointer exists but the payload was pruned or half-deleted.
    writePointer(
      { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
      root
    );
    expect(shouldRedirectToStore('54.18.0', root)).toBeUndefined();
  });

  it('does not redirect when there is no store', () => {
    expect(shouldRedirectToStore('54.18.0', root)).toBeUndefined();
  });
});
