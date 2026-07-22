import { afterAll, describe, expect, it } from 'vitest';
import execa from 'execa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deriveStagedPycFsPath, runCompileAll } from '../src/compileall';
import {
  RUNTIME_DEPS_DIR,
  LAMBDA_EPHEMERAL_STORAGE_BYTES,
  EPHEMERAL_INSTALL_BUDGET_BYTES,
} from '../src/dependency-externalizer';

const tmpDirs: string[] = [];

function makeTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('pycache-prefix staging layout (real CPython)', () => {
  // Validates the core assumption of the bytecode-first packing mode: the
  // path where compileall (run with PYTHONPYCACHEPREFIX) writes a .pyc
  // matches deriveStagedPycFsPath(). If CPython's cache_from_source layout
  // ever changes, this test fails rather than silently shipping an
  // unaddressable bytecode tree.
  const pythonBin = process.env.PYTHON_BIN || 'python3';

  it('compileall writes staged pyc at the derived path', async () => {
    const { stdout } = await execa(pythonBin, [
      '-c',
      'import sys; print(f"{sys.version_info[0]} {sys.version_info[1]}")',
    ]);
    const [major, minor] = stdout.trim().split(' ').map(Number);

    const workPath = makeTempDir('vc-py-prefix-real-');
    const stagingDir = path.join(workPath, 'staging');
    const srcPath = path.join(workPath, 'src', 'pkg', 'mod.py');
    fs.mkdirSync(path.dirname(srcPath), { recursive: true });
    fs.writeFileSync(srcPath, 'X = 1\n');

    await runCompileAll({
      pythonBin,
      filesOrDirectories: [path.join(workPath, 'src')],
      pycachePrefix: stagingDir,
    });

    const derived = deriveStagedPycFsPath(stagingDir, srcPath, major, minor);
    expect(derived).not.toBeNull();
    expect(fs.existsSync(derived!)).toBe(true);

    // No adjacent __pycache__ was created next to the source.
    expect(fs.existsSync(path.join(path.dirname(srcPath), '__pycache__'))).toBe(
      false
    );
  });
});

describe('runtime deps constants', () => {
  it('RUNTIME_DEPS_DIR and the site-packages layout stay in sync with vc_init.py', () => {
    // The bytecode-first bundle keys its /tmp bytecode tree on the install
    // path hardcoded in the runtime bootstrap (the builder inlines
    // `${RUNTIME_DEPS_DIR}/lib/pythonX.Y/site-packages`). If either side
    // moves, the bytecode silently stops matching — pin them together here.
    const vcInitPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'python',
      'vercel-runtime',
      'src',
      'vercel_runtime',
      'vc_init.py'
    );
    const source = fs.readFileSync(vcInitPath, 'utf8');
    expect(source).toContain(`_deps_dir = "${RUNTIME_DEPS_DIR}"`);
    // _site_packages = os.path.join(_deps_dir, "lib", f"python{major}.{minor}",
    // "site-packages")
    expect(source).toMatch(
      /_site_packages = os\.path\.join\(\s*_deps_dir,\s*"lib",\s*f"python\{sys\.version_info\.major\}\.\{sys\.version_info\.minor\}",\s*"site-packages",?\s*\)/
    );
  });

  it('packing-mode budget stays below ephemeral storage', () => {
    expect(EPHEMERAL_INSTALL_BUDGET_BYTES).toBeGreaterThan(0);
    expect(EPHEMERAL_INSTALL_BUDGET_BYTES).toBeLessThan(
      LAMBDA_EPHEMERAL_STORAGE_BYTES
    );
  });
});
