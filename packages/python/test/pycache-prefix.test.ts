import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const compileAllScriptPath = path.join(
  __dirname,
  '..',
  'templates',
  'vc_compileall.py'
);
let processPoolAvailable = false;

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

beforeAll(async () => {
  try {
    await execa(process.env.PYTHON_BIN || 'python3', [
      '-c',
      'from multiprocessing import Pool; Pool().terminate()',
    ]);
    processPoolAvailable = true;
  } catch {}
});

describe('explicit-list compilation layout (real CPython)', () => {
  // Validates the core assumption of the bytecode-first packing mode: the
  // path where the coordinator (run with PYTHONPYCACHEPREFIX) writes a .pyc
  // matches deriveStagedPycFsPath(). If CPython's cache_from_source layout
  // ever changes, this test fails rather than silently shipping an
  // unaddressable bytecode tree.
  const pythonBin = process.env.PYTHON_BIN || 'python3';

  async function getPythonInfo() {
    const { stdout } = await execa(pythonBin, [
      '-c',
      'import json, sys; print(json.dumps([sys.version_info[0], sys.version_info[1], sys.pycache_prefix]))',
    ]);
    return JSON.parse(stdout) as [number, number, string | null];
  }

  it('writes adjacent bytecode for multiple source files', async () => {
    if (!processPoolAvailable) return;
    const [major, minor, interpreterPrefix] = await getPythonInfo();
    // Apple's system Python forces a global prefix that cannot be disabled
    // through PYTHONPYCACHEPREFIX. Other CPython installations exercise the
    // adjacent layout here; prefix layout is covered unconditionally below.
    if (interpreterPrefix !== null) return;

    const workPath = makeTempDir('vc-py-adjacent-real-');
    const sourcePaths = ['first.py', 'nested/second.py'].map(relativePath =>
      path.join(workPath, 'src', relativePath)
    );
    for (const srcPath of sourcePaths) {
      fs.mkdirSync(path.dirname(srcPath), { recursive: true });
      fs.writeFileSync(srcPath, 'X = 1\n');
    }

    await expect(
      runCompileAll({ pythonBin, sourceFiles: sourcePaths })
    ).resolves.toBe(true);

    for (const srcPath of sourcePaths) {
      expect(
        fs.existsSync(
          path.join(
            path.dirname(srcPath),
            '__pycache__',
            `${path.parse(srcPath).name}.cpython-${major}${minor}.pyc`
          )
        )
      ).toBe(true);
    }
  });

  it('writes multiple staged pyc files at their derived paths', async () => {
    if (!processPoolAvailable) return;
    const [major, minor] = await getPythonInfo();

    const workPath = makeTempDir('vc-py-prefix-real-');
    const stagingDir = path.join(workPath, 'staging');
    const sourcePaths = ['pkg/first.py', 'pkg/nested/second.py'].map(
      relativePath => path.join(workPath, 'src', relativePath)
    );
    for (const srcPath of sourcePaths) {
      fs.mkdirSync(path.dirname(srcPath), { recursive: true });
      fs.writeFileSync(srcPath, 'X = 1\n');
    }

    await expect(
      runCompileAll({
        pythonBin,
        sourceFiles: sourcePaths,
        pycachePrefix: stagingDir,
      })
    ).resolves.toBe(true);

    for (const srcPath of sourcePaths) {
      const derived = deriveStagedPycFsPath(stagingDir, srcPath, major, minor);
      expect(derived).not.toBeNull();
      expect(fs.existsSync(derived!)).toBe(true);
      expect(
        fs.existsSync(path.join(path.dirname(srcPath), '__pycache__'))
      ).toBe(false);
    }
  });

  it('does not run when loaded as a multiprocessing child module', async () => {
    await expect(
      execa(pythonBin, [
        '-c',
        "import runpy, sys; runpy.run_path(sys.argv[1], run_name='vc_compileall_child')",
        compileAllScriptPath,
      ])
    ).resolves.toBeDefined();
  });

  it('preserves successfully compiled bytecode when another source fails', async () => {
    if (!processPoolAvailable) return;
    const [major, minor] = await getPythonInfo();

    const workPath = makeTempDir('vc-py-partial-real-');
    const stagingDir = path.join(workPath, 'staging');
    const validSource = path.join(workPath, 'valid.py');
    const invalidSource = path.join(workPath, 'invalid.py');
    fs.writeFileSync(validSource, 'X = 1\n');
    fs.writeFileSync(invalidSource, 'def invalid syntax\n');

    await expect(
      runCompileAll({
        pythonBin,
        sourceFiles: [validSource, invalidSource],
        pycachePrefix: stagingDir,
      })
    ).resolves.toBe(true);

    const validBytecode = deriveStagedPycFsPath(
      stagingDir,
      validSource,
      major,
      minor
    );
    expect(validBytecode).not.toBeNull();
    expect(fs.existsSync(validBytecode!)).toBe(true);
  });

  it('exits nonzero when multiprocessing is unavailable', async () => {
    const workPath = makeTempDir('vc-py-unavailable-real-');
    const sourcePath = path.join(workPath, 'source.py');
    const sourceListPath = path.join(workPath, 'sources.json');
    fs.writeFileSync(sourcePath, 'X = 1\n');
    fs.writeFileSync(sourceListPath, JSON.stringify([sourcePath]));

    const runWithUnavailablePool = `
import runpy
import sys

module = runpy.run_path(sys.argv[1], run_name="vc_compileall_test")

def unavailable_pool():
    raise OSError("multiprocessing unavailable")

module["main"].__globals__["Pool"] = unavailable_pool
sys.argv = [sys.argv[1], sys.argv[2]]
sys.exit(module["main"]())
`;

    const result = await execa(
      pythonBin,
      ['-c', runWithUnavailablePool, compileAllScriptPath, sourceListPath],
      { reject: false }
    );
    expect(result.code).toBe(1);
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
