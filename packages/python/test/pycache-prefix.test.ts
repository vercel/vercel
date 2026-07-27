import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import execa from 'execa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FileFsRef } from '@vercel/build-utils';
import type { Distribution } from '@vercel/python-analysis';
import {
  collectAppAdjacentBytecodeAsPrefixFiles,
  derivePycPath,
  PYCACHE_PREFIX_DIR,
  runCompileAll,
} from '../src/compileall';
import {
  RUNTIME_DEPS_DIR,
  LAMBDA_EPHEMERAL_STORAGE_BYTES,
  EPHEMERAL_INSTALL_BUDGET_BYTES,
} from '../src/dependency-externalizer';
import { InstalledPythonDistributions } from '../src/installed-distributions';

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

  it('loads adjacent dependency bytecode after mapping it into a runtime prefix', async () => {
    if (!processPoolAvailable) return;
    const [major, minor, interpreterPrefix] = await getPythonInfo();
    if (interpreterPrefix !== null) return;

    const workPath = makeTempDir('vc-py-adjacent-prefix-real-');
    const venvPath = path.join(workPath, 'venv');
    const sitePackagesDir = path.join(
      venvPath,
      'lib',
      `python${major}.${minor}`,
      'site-packages'
    );
    const buildSource = path.join(sitePackagesDir, 'pkg', 'mod.py');
    fs.mkdirSync(path.dirname(buildSource), { recursive: true });
    fs.writeFileSync(buildSource, 'VALUE = "compiled dependency"\n');

    await expect(
      runCompileAll({ pythonBin, sourceFiles: [buildSource] })
    ).resolves.toBe(true);

    const distribution: Distribution = {
      name: 'pkg',
      version: '1.0.0',
      metadataVersion: '2.1',
      requiresDist: [],
      providesExtra: [],
      classifiers: [],
      projectUrls: [],
      platforms: [],
      dynamic: [],
      files: [{ path: 'pkg/mod.py' }],
    };
    const installed = new InstalledPythonDistributions({
      sitePackageDirs: [sitePackagesDir],
      distributions: new Map([
        [sitePackagesDir, new Map([['pkg', distribution]])],
      ]),
      pythonMajor: major,
      pythonMinor: minor,
    });
    const runtimeSitePackages = path.join(workPath, 'runtime', 'site-packages');
    const collected = await installed.collectAdjacentBytecodeAsPrefixFiles({
      runtimeRoot: runtimeSitePackages,
    });
    const [bundlePath] = Object.keys(collected.files);
    expect(bundlePath).toMatch(
      new RegExp(
        `^${PYCACHE_PREFIX_DIR}/.+/pkg/mod\\.cpython-${major}${minor}\\.pyc$`
      )
    );

    const prefixDir = path.join(workPath, 'runtime-pycache');
    const prefixRelativePath = bundlePath.slice(
      `${PYCACHE_PREFIX_DIR}/`.length
    );
    const prefixPycPath = path.join(
      prefixDir,
      ...prefixRelativePath.split('/')
    );
    fs.mkdirSync(path.dirname(prefixPycPath), { recursive: true });
    fs.copyFileSync(
      (collected.files[bundlePath] as FileFsRef).fsPath,
      prefixPycPath
    );

    const runtimeSource = path.join(runtimeSitePackages, 'pkg', 'mod.py');
    fs.mkdirSync(path.dirname(runtimeSource), { recursive: true });
    fs.writeFileSync(runtimeSource, 'VALUE = "runtime source"\n');
    const { stdout } = await execa(
      pythonBin,
      ['-c', 'from pkg.mod import VALUE; print(VALUE)'],
      {
        env: {
          ...process.env,
          PYTHONPATH: runtimeSitePackages,
          PYTHONPYCACHEPREFIX: prefixDir,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      }
    );
    expect(stdout).toBe('compiled dependency');
  });

  it('loads adjacent app bytecode after mapping it into a runtime prefix', async () => {
    if (!processPoolAvailable) return;
    const [major, minor, interpreterPrefix] = await getPythonInfo();
    if (interpreterPrefix !== null) return;

    const workPath = makeTempDir('vc-py-adjacent-app-prefix-real-');
    const buildSource = path.join(workPath, 'app.py');
    fs.writeFileSync(buildSource, 'VALUE = "compiled app"\n');

    await expect(
      runCompileAll({ pythonBin, sourceFiles: [buildSource] })
    ).resolves.toBe(true);

    const runtimeRootPath = path.join(workPath, 'runtime');
    fs.mkdirSync(runtimeRootPath, { recursive: true });
    const runtimeRoot = fs.realpathSync(runtimeRootPath);
    const collected = await collectAppAdjacentBytecodeAsPrefixFiles({
      workPath,
      files: { 'app.py': new FileFsRef({ fsPath: buildSource }) },
      runtimeTaskRoot: runtimeRoot,
      pythonMajor: major,
      pythonMinor: minor,
    });
    const [bundlePath] = Object.keys(collected.files);
    expect(bundlePath).toMatch(
      new RegExp(
        `^${PYCACHE_PREFIX_DIR}/.+/app\\.cpython-${major}${minor}\\.pyc$`
      )
    );

    const prefixDir = path.join(runtimeRoot, PYCACHE_PREFIX_DIR);
    const prefixPycPath = path.join(runtimeRoot, ...bundlePath.split('/'));
    fs.mkdirSync(path.dirname(prefixPycPath), { recursive: true });
    fs.copyFileSync(
      (collected.files[bundlePath] as FileFsRef).fsPath,
      prefixPycPath
    );
    fs.writeFileSync(
      path.join(runtimeRoot, 'app.py'),
      'VALUE = "runtime source"\n'
    );

    const { stdout } = await execa(
      pythonBin,
      ['-c', 'from app import VALUE; print(VALUE)'],
      {
        cwd: runtimeRoot,
        env: {
          ...process.env,
          PYTHONPATH: runtimeRoot,
          PYTHONPYCACHEPREFIX: prefixDir,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      }
    );
    expect(stdout).toBe('compiled app');
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

  it('removes stale bytecode when recompilation fails for one source', async () => {
    if (!processPoolAvailable) return;
    const [major, minor, interpreterPrefix] = await getPythonInfo();
    if (interpreterPrefix !== null) return;

    const workPath = makeTempDir('vc-py-partial-real-');
    const validSource = path.join(workPath, 'valid.py');
    const invalidSource = path.join(workPath, 'invalid.py');
    fs.writeFileSync(validSource, 'X = 1\n');
    fs.writeFileSync(invalidSource, 'X = 1\n');

    await expect(
      runCompileAll({
        pythonBin,
        sourceFiles: [validSource, invalidSource],
      })
    ).resolves.toBe(true);

    const validRelativeBytecode = derivePycPath('valid.py', major, minor);
    const invalidRelativeBytecode = derivePycPath('invalid.py', major, minor);
    expect(validRelativeBytecode).not.toBeNull();
    expect(invalidRelativeBytecode).not.toBeNull();
    const validBytecode = path.join(workPath, validRelativeBytecode!);
    const invalidBytecode = path.join(workPath, invalidRelativeBytecode!);
    expect(validBytecode).not.toBeNull();
    expect(invalidBytecode).not.toBeNull();
    expect(fs.existsSync(validBytecode)).toBe(true);
    expect(fs.existsSync(invalidBytecode)).toBe(true);

    fs.writeFileSync(invalidSource, 'def invalid syntax\n');
    await expect(
      runCompileAll({
        pythonBin,
        sourceFiles: [validSource, invalidSource],
      })
    ).resolves.toBe(true);

    expect(fs.existsSync(validBytecode)).toBe(true);
    expect(fs.existsSync(invalidBytecode)).toBe(false);
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
