import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeRequire = createRequire(import.meta.url);
const prelude = join(
  dirname(runtimeRequire.resolve('@yao-pkg/pkg/package.json')),
  'prelude'
);

// Extract the installed esbuild factory, not a reimplementation of extraction.
// Fail closed if the upstream bundle layout changes; never run the full binary
// bootstrap (which patches process, fs, module loading, and worker_threads).
function extractFactory(bundle: string, factory: string, modulePath: string) {
  const matches = [
    ...bundle.matchAll(
      new RegExp(
        `^var ${factory} = __commonJS\\((\\{\\n[\\s\\S]*?^\\})\\);`,
        'gm'
      )
    ),
  ];
  expect(matches, `installed bundle factory ${factory}`).toHaveLength(1);
  const object = matches[0][1];
  expect(object).toContain(`${JSON.stringify(modulePath)}(exports2, module2)`);
  return `(${object})[${JSON.stringify(modulePath)}](module.exports, module);`;
}

const bundle = fs.readFileSync(
  join(prelude, 'sea-bootstrap.bundle.js'),
  'utf8'
);
const workerModule = { exports: '' };
runInNewContext(
  extractFactory(
    bundle,
    'require_worker_bootstrap_string',
    'prelude/_worker-bootstrap-string.js'
  ),
  { module: workerModule }
);
expect(typeof workerModule.exports).toBe('string');

const bootstraps = [
  {
    name: 'bootstrap-shared.js',
    code: fs.readFileSync(join(prelude, 'bootstrap-shared.js'), 'utf8'),
  },
  {
    name: 'sea-bootstrap.bundle.js',
    code: extractFactory(
      bundle,
      'require_bootstrap_shared',
      'prelude/bootstrap-shared.js'
    ),
  },
  {
    name: 'embedded WORKER_BOOTSTRAP',
    code: extractFactory(
      workerModule.exports,
      'require_bootstrap_shared',
      'prelude/bootstrap-shared.js'
    ),
  },
];

// Equal lengths ensure that cache/race checks must compare contents, not size.
const addonBytes = Buffer.from('new complete native addon');
const previousBytes = Buffer.from('old complete native addon');
const pid = 4242;
const dlopenFlags = 2;
type Layout = 'node_modules (cpRecursive)' | 'standalone (patchDlopen)';
const layouts: Layout[] = [
  'node_modules (cpRecursive)',
  'standalone (patchDlopen)',
];

let root: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pkg-native-cache-')));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function createHarness(code: string, layout: Layout) {
  const relativeAddon =
    layout === 'node_modules (cpRecursive)'
      ? join('addon', 'build', 'Release', 'addon.node')
      : 'addon.node';
  const source = join(
    root,
    'snapshot',
    layout === 'node_modules (cpRecursive)' ? 'node_modules' : 'standalone',
    relativeAddon
  );
  fs.mkdirSync(dirname(source), { recursive: true });
  fs.writeFileSync(source, new Uint8Array(addonBytes));

  const cache = join(root, 'cache');
  const hash = createHash('sha256')
    .update(new Uint8Array(addonBytes))
    .digest('hex');
  const destination = join(cache, 'pkg', hash, relativeAddon);
  const wrappedFs = {
    ...fs,
    writeFileSync: vi.fn((file: string, content: Buffer) => {
      expect(file, 'must not write/truncate the published addon').not.toBe(
        destination
      );
      fs.writeFileSync(file, new Uint8Array(content));
    }),
    renameSync: vi.fn((from: string, to: string) => fs.renameSync(from, to)),
    unlinkSync: vi.fn((file: string) => fs.unlinkSync(file)),
    // Catch alternative non-atomic write paths, too. Real fs.writeFileSync
    // internals use the real fs module, not these wrapper methods.
    openSync: vi.fn(fs.openSync),
    truncateSync: vi.fn(fs.truncateSync),
    copyFileSync: vi.fn(fs.copyFileSync),
  };
  const nativeDlopen = vi.fn(
    (_module: object, filename: string, _flags: number) =>
      fs.readFileSync(filename)
  );
  const fakeProcess = {
    pid,
    env: { PKG_NATIVE_CACHE_PATH: cache },
    dlopen: nativeDlopen,
  };
  const module = {
    exports: {} as {
      patchDlopen: (insideSnapshot: (filename: string) => boolean) => void;
    },
  };
  runInNewContext(code, {
    module,
    exports: module.exports,
    process: fakeProcess,
    Buffer,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    require: (id: string) => (id === 'fs' ? wrappedFs : runtimeRequire(id)),
  });
  expect(module.exports.patchDlopen).toBeTypeOf('function');
  module.exports.patchDlopen(filename => filename === source);

  const addonModule = { exports: {} };
  const load = () => fakeProcess.dlopen(addonModule, source, dlopenFlags);
  return {
    destination,
    fs: wrappedFs,
    load,
    seedDestination(content: Buffer) {
      fs.mkdirSync(dirname(destination), { recursive: true });
      fs.writeFileSync(destination, new Uint8Array(content));
    },
    expectLoaded() {
      expect(nativeDlopen).toHaveBeenCalledExactlyOnceWith(
        addonModule,
        destination,
        dlopenFlags
      );
      expect(nativeDlopen.mock.contexts[0]).toBe(fakeProcess);
    },
    expectFailure(error: Error) {
      let thrown: unknown;
      try {
        load();
      } catch (caught) {
        thrown = caught;
      }
      expect(thrown).toBe(error);
      expect(nativeDlopen).not.toHaveBeenCalled();
    },
    expectTemporaryWrite() {
      expect(wrappedFs.writeFileSync).toHaveBeenCalledTimes(1);
      const [temporary, content] = wrappedFs.writeFileSync.mock.calls[0];
      expect(temporary).not.toBe(destination);
      expect(dirname(temporary)).toBe(dirname(destination));
      expect(content).toEqual(addonBytes);
      expect(wrappedFs.openSync).not.toHaveBeenCalled();
      expect(wrappedFs.truncateSync).not.toHaveBeenCalled();
      expect(wrappedFs.copyFileSync).not.toHaveBeenCalled();
      return temporary;
    },
    expectDestination(content?: Buffer) {
      if (content) {
        expect(fs.readFileSync(destination)).toEqual(content);
      } else {
        expect(fs.existsSync(destination)).toBe(false);
      }
      // Check before afterEach removes the fixture: cleanup must be done by pkg.
      expect(fs.readdirSync(dirname(destination))).toEqual(
        content ? [basename(destination)] : []
      );
    },
  };
}

function ioError(code: string, syscall: string) {
  return Object.assign(new Error(`${code}: injected ${syscall} failure`), {
    code,
    syscall,
  });
}

const cacheStates = ['missing', 'existing'] as const;

describe.each(bootstraps)('$name atomic native-addon cache', ({ code }) => {
  describe.each(layouts)('%s', layout => {
    it.each(
      cacheStates
    )('publishes atomically when the destination is %s', state => {
      const h = createHarness(code, layout);
      const previous = state === 'existing' ? previousBytes : undefined;
      if (previous) h.seedDestination(previous);
      h.fs.renameSync.mockImplementation((temporary, destination) => {
        // The complete new bytes are only in the sibling temp file until the
        // rename. An already published file remains readable and untouched.
        expect(destination).toBe(h.destination);
        expect(fs.readFileSync(temporary)).toEqual(addonBytes);
        if (previous) {
          expect(fs.readFileSync(destination)).toEqual(previous);
        } else {
          expect(fs.existsSync(destination)).toBe(false);
        }
        fs.renameSync(temporary, destination);
      });

      expect(h.load()).toEqual(addonBytes);
      const temporary = h.expectTemporaryWrite();
      expect(h.fs.renameSync).toHaveBeenCalledExactlyOnceWith(
        temporary,
        h.destination
      );
      h.expectLoaded();
      h.expectDestination(addonBytes);
    });

    it('does not write an identical cached addon', () => {
      const h = createHarness(code, layout);
      h.seedDestination(addonBytes);

      expect(h.load()).toEqual(addonBytes);
      h.expectLoaded();
      for (const method of [
        'writeFileSync',
        'renameSync',
        'unlinkSync',
        'openSync',
        'truncateSync',
        'copyFileSync',
      ] as const) {
        expect(h.fs[method]).not.toHaveBeenCalled();
      }
      h.expectDestination(addonBytes);
    });

    it.each(
      cacheStates
    )('cleans a partial ENOSPC write when the destination is %s', state => {
      const h = createHarness(code, layout);
      const previous = state === 'existing' ? previousBytes : undefined;
      if (previous) h.seedDestination(previous);
      const error = ioError('ENOSPC', 'write');
      h.fs.writeFileSync.mockImplementation((temporary, content) => {
        // Actually leave partial bytes on disk before throwing, unlike a
        // mock that throws without creating the file and hides cleanup bugs.
        fs.writeFileSync(temporary, new Uint8Array(content.subarray(0, 5)));
        throw error;
      });

      h.expectFailure(error);
      h.expectTemporaryWrite();
      expect(h.fs.renameSync).not.toHaveBeenCalled();
      h.expectDestination(previous);
    });

    it.each(
      cacheStates
    )('cleans a failed rename when the destination is %s', state => {
      const h = createHarness(code, layout);
      const previous = state === 'existing' ? previousBytes : undefined;
      if (previous) h.seedDestination(previous);
      const error = ioError('EACCES', 'rename');
      h.fs.renameSync.mockImplementation(() => {
        throw error;
      });

      h.expectFailure(error);
      const temporary = h.expectTemporaryWrite();
      expect(h.fs.renameSync).toHaveBeenCalledExactlyOnceWith(
        temporary,
        h.destination
      );
      h.expectDestination(previous);
    });

    it.each([
      'identical',
      'different',
    ] as const)('handles a Windows-style lost rename race with %s destination bytes', winner => {
      const h = createHarness(code, layout);
      const winningBytes = winner === 'identical' ? addonBytes : previousBytes;
      const error = ioError('EPERM', 'rename');
      h.fs.renameSync.mockImplementation((temporary, destination) => {
        expect(fs.readFileSync(temporary)).toEqual(addonBytes);
        expect(fs.existsSync(destination)).toBe(false);
        // Deterministic interleaving: another process publishes after our
        // cache check/write but before rename refuses to replace its file.
        fs.writeFileSync(destination, new Uint8Array(winningBytes));
        throw error;
      });

      if (winner === 'identical') {
        expect(h.load()).toEqual(addonBytes);
        h.expectLoaded();
      } else {
        h.expectFailure(error);
      }
      const temporary = h.expectTemporaryWrite();
      expect(h.fs.renameSync).toHaveBeenCalledExactlyOnceWith(
        temporary,
        h.destination
      );
      h.expectDestination(winningBytes);
    });
  });
});
