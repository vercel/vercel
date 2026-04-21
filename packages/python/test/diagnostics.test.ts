import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { FileBlob, MANIFEST_FILENAME, manifestPath } from '@vercel/build-utils';
import type {
  DependencyGroupEntry,
  PythonPackage,
} from '@vercel/python-analysis';
import type { PythonVersion } from '../src/version';
import { generateProjectManifest, diagnostics } from '../src/diagnostics';

const DIAGNOSTICS_PATH = manifestPath('python');

const pythonVersion: PythonVersion = {
  major: 3,
  minor: 12,
  pipPath: 'pip3.12',
  pythonPath: 'python3.12',
  runtime: 'python3.12',
};

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-diag-test-'));
}

function writeUvLock(
  dir: string,
  packages: {
    name: string;
    version: string;
    source?: string;
    dependencies?: string[];
  }[]
): string {
  const lockPath = path.join(dir, 'uv.lock');
  const entries = packages
    .map(p => {
      let block = `[[package]]\nname = "${p.name}"\nversion = "${p.version}"`;
      if (p.source) {
        block += `\n${p.source}`;
      }
      if (p.dependencies && p.dependencies.length > 0) {
        const depEntries = p.dependencies
          .map(d => `    { name = "${d}" }`)
          .join(',\n');
        block += `\ndependencies = [\n${depEntries},\n]`;
      }
      return block;
    })
    .join('\n\n');
  fs.writeFileSync(
    lockPath,
    `version = 1\nrequires-python = ">=3.10"\n\n${entries}\n`
  );
  return lockPath;
}

function makePackage(opts: {
  name?: string;
  dependencies?: string[];
  optionalDependencies?: Record<string, string[]>;
  dependencyGroups?: Record<string, DependencyGroupEntry[]>;
  uvDevDependencies?: string[];
  requiresPython?: string;
  requiresPythonSource?: string;
}): PythonPackage {
  const pkg: PythonPackage = {
    manifest: {
      path: 'pyproject.toml',
      data: {
        project: {
          name: opts.name ?? 'test-app',
          ...(opts.dependencies ? { dependencies: opts.dependencies } : {}),
          ...(opts.requiresPython
            ? { 'requires-python': opts.requiresPython }
            : {}),
          ...(opts.optionalDependencies
            ? { 'optional-dependencies': opts.optionalDependencies }
            : {}),
        },
        ...(opts.dependencyGroups
          ? { 'dependency-groups': opts.dependencyGroups }
          : {}),
        ...(opts.uvDevDependencies
          ? { tool: { uv: { 'dev-dependencies': opts.uvDevDependencies } } }
          : {}),
      },
    },
  };

  if (opts.requiresPython) {
    pkg.requiresPython = [
      {
        request: [],
        source: opts.requiresPythonSource ?? 'pyproject.toml',
        prettySource: `"requires-python" key in pyproject.toml`,
        specifier: opts.requiresPython,
      },
    ];
  }

  return pkg;
}

describe('generateProjectManifest', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('generates manifest with direct and transitive deps from uv.lock', async () => {
    const pkg = makePackage({
      dependencies: ['flask>=2.0', 'requests'],
    });

    const uvLockPath = writeUvLock(tempDir, [
      {
        name: 'flask',
        version: '3.1.0',
        dependencies: ['werkzeug', 'jinja2'],
      },
      { name: 'requests', version: '2.32.0' },
      { name: 'werkzeug', version: '3.0.0' },
      { name: 'jinja2', version: '3.1.4' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifestPath = path.join(tempDir, DIAGNOSTICS_PATH);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.version).toBe('20260304');
    expect(manifest.runtime).toBe('python');
    expect(manifest.runtimeVersion.resolved).toBe('3.12');

    // Direct deps should have resolved versions from lock
    const directDeps = manifest.dependencies.filter(
      (d: any) => d.type === 'direct'
    );
    expect(directDeps).toEqual([
      {
        name: 'flask',
        type: 'direct',
        scopes: ['main'],
        requested: 'flask>=2.0',
        resolved: '3.1.0',
      },
      {
        name: 'requests',
        type: 'direct',
        scopes: ['main'],
        requested: 'requests',
        resolved: '2.32.0',
      },
    ]);

    // Transitive deps should inherit scope from direct dep
    const werkzeug = manifest.dependencies.find(
      (d: any) => d.name === 'werkzeug'
    );
    expect(werkzeug.type).toBe('transitive');
    expect(werkzeug.scopes).toEqual(['main']);

    const transitiveNames = manifest.dependencies
      .filter((d: any) => d.type === 'transitive')
      .map((d: any) => d.name);
    expect(transitiveNames).toContain('werkzeug');
    expect(transitiveNames).toContain('jinja2');
    expect(transitiveNames).not.toContain('flask');
    expect(transitiveNames).not.toContain('requests');
  });

  it('generates manifest with no dependencies', async () => {
    const pkg = makePackage({});
    const uvLockPath = writeUvLock(tempDir, []);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.dependencies).toEqual([]);
  });

  it('includes requested python version from constraint', async () => {
    const pkg = makePackage({
      requiresPython: '>=3.10',
      requiresPythonSource: 'pyproject.toml',
    });
    const uvLockPath = writeUvLock(tempDir, []);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.runtimeVersion).toEqual({
      requested: '>=3.10',
      requestedSource: 'pyproject.toml',
      resolved: '3.12',
    });
  });

  it('omits requested when no python version constraint', async () => {
    const pkg: PythonPackage = {
      manifest: {
        path: 'pyproject.toml',
        data: { project: { name: 'test-app' } },
      },
    };
    const uvLockPath = writeUvLock(tempDir, []);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.runtimeVersion).toEqual({ resolved: '3.12' });
  });

  it('excludes project itself from transitive deps', async () => {
    const pkg = makePackage({
      name: 'my-app',
      dependencies: ['flask'],
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'my-app', version: '0.1.0', dependencies: ['flask'] },
      { name: 'flask', version: '3.1.0', dependencies: ['werkzeug'] },
      { name: 'werkzeug', version: '3.0.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );
    const allNames = manifest.dependencies.map((d: any) => d.name);
    expect(allNames).not.toContain('my-app');
  });

  it('handles extras and markers in dependencies', async () => {
    const pkg = makePackage({
      dependencies: ['uvicorn[standard]>=0.20 ; python_version >= "3.8"'],
    });
    const uvLockPath = writeUvLock(tempDir, [
      { name: 'uvicorn', version: '0.30.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.dependencies).toEqual([
      {
        name: 'uvicorn',
        type: 'direct',
        scopes: ['main'],
        requested: 'uvicorn[standard]>=0.20 ; python_version >= "3.8"',
        resolved: '0.30.0',
      },
    ]);
  });

  it('collects optional-dependencies with correct scopes', async () => {
    const pkg = makePackage({
      dependencies: ['flask'],
      optionalDependencies: {
        mypy: ['mypy>=1.0', 'types-requests'],
        test: ['pytest'],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'flask', version: '3.1.0' },
      { name: 'mypy', version: '1.8.0' },
      { name: 'types-requests', version: '2.31.0' },
      { name: 'pytest', version: '8.0.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const directDeps = manifest.dependencies.filter(
      (d: any) => d.type === 'direct'
    );
    expect(directDeps).toEqual([
      {
        name: 'flask',
        type: 'direct',
        scopes: ['main'],
        requested: 'flask',
        resolved: '3.1.0',
      },
      {
        name: 'mypy',
        type: 'direct',
        scopes: ['mypy'],
        requested: 'mypy>=1.0',
        resolved: '1.8.0',
      },
      {
        name: 'pytest',
        type: 'direct',
        scopes: ['test'],
        requested: 'pytest',
        resolved: '8.0.0',
      },
      {
        name: 'types-requests',
        type: 'direct',
        scopes: ['mypy'],
        requested: 'types-requests',
        resolved: '2.31.0',
      },
    ]);
  });

  it('collects dependency-groups with correct scopes', async () => {
    const pkg = makePackage({
      dependencies: ['flask'],
      dependencyGroups: {
        dev: ['ruff>=0.1.0', 'black'],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'flask', version: '3.1.0' },
      { name: 'ruff', version: '0.3.0' },
      { name: 'black', version: '24.1.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const devDeps = manifest.dependencies.filter((d: any) =>
      d.scopes.includes('dev')
    );
    expect(devDeps).toEqual([
      {
        name: 'black',
        type: 'direct',
        scopes: ['dev'],
        requested: 'black',
        resolved: '24.1.0',
      },
      {
        name: 'ruff',
        type: 'direct',
        scopes: ['dev'],
        requested: 'ruff>=0.1.0',
        resolved: '0.3.0',
      },
    ]);
  });

  it('collects tool.uv.dev-dependencies with dev scope', async () => {
    const pkg = makePackage({
      dependencies: ['flask'],
      uvDevDependencies: ['ruff>=0.1.0', 'black'],
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'flask', version: '3.1.0' },
      { name: 'ruff', version: '0.3.0' },
      { name: 'black', version: '24.1.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const devDeps = manifest.dependencies.filter((d: any) =>
      d.scopes.includes('dev')
    );
    expect(devDeps).toEqual([
      {
        name: 'black',
        type: 'direct',
        scopes: ['dev'],
        requested: 'black',
        resolved: '24.1.0',
      },
      {
        name: 'ruff',
        type: 'direct',
        scopes: ['dev'],
        requested: 'ruff>=0.1.0',
        resolved: '0.3.0',
      },
    ]);
  });

  it('resolves include-group references in dependency-groups', async () => {
    const pkg = makePackage({
      dependencies: ['flask'],
      dependencyGroups: {
        test: ['pytest'],
        dev: ['ruff', { 'include-group': 'test' }],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'flask', version: '3.1.0' },
      { name: 'pytest', version: '8.0.0' },
      { name: 'ruff', version: '0.3.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const pytest = manifest.dependencies.find((d: any) => d.name === 'pytest');
    // pytest is in "test" directly and included in "dev" via include-group
    expect(pytest.type).toBe('direct');
    expect(pytest.scopes).toEqual(['dev', 'test']);

    const ruff = manifest.dependencies.find((d: any) => d.name === 'ruff');
    expect(ruff.type).toBe('direct');
    expect(ruff.scopes).toEqual(['dev']);
  });

  it('handles circular include-group references without looping', async () => {
    const pkg = makePackage({
      dependencyGroups: {
        a: ['requests', { 'include-group': 'b' }],
        b: ['flask', { 'include-group': 'a' }],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'requests', version: '2.32.0' },
      { name: 'flask', version: '3.1.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const names = manifest.dependencies.map((d: any) => d.name);
    expect(names).toContain('requests');
    expect(names).toContain('flask');
  });

  it('skips non-existent include-group targets gracefully', async () => {
    const pkg = makePackage({
      dependencyGroups: {
        dev: ['ruff', { 'include-group': 'nonexistent' }],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'ruff', version: '0.3.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    expect(manifest.dependencies).toEqual([
      {
        name: 'ruff',
        type: 'direct',
        scopes: ['dev'],
        requested: 'ruff',
        resolved: '0.3.0',
      },
    ]);
  });

  it('includes source info from lock file', async () => {
    const pkg = makePackage({
      dependencies: ['flask', 'my-lib'],
    });

    const uvLockPath = writeUvLock(tempDir, [
      {
        name: 'flask',
        version: '3.1.0',
        source: '[package.source]\nregistry = "https://pypi.org/simple"',
      },
      {
        name: 'my-lib',
        version: '0.1.0',
        source: '[package.source]\ngit = "https://github.com/org/my-lib.git"',
      },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const flask = manifest.dependencies.find((d: any) => d.name === 'flask');
    expect(flask.source).toBe('registry');
    expect(flask.sourceUrl).toBe('https://pypi.org');

    const myLib = manifest.dependencies.find((d: any) => d.name === 'my-lib');
    expect(myLib.source).toBe('git');
    expect(myLib.sourceUrl).toBe('https://github.com/org/my-lib.git');
  });

  it('skips virtual source packages', async () => {
    const pkg = makePackage({
      name: 'my-app',
      dependencies: ['flask'],
    });

    const uvLockPath = writeUvLock(tempDir, [
      {
        name: 'my-app',
        version: '0.1.0',
        source: '[package.source]\nvirtual = "."',
      },
      { name: 'flask', version: '3.1.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );
    const allNames = manifest.dependencies.map((d: any) => d.name);
    expect(allNames).not.toContain('my-app');
    expect(allNames).toContain('flask');
  });

  it('transitive deps inherit scopes from their dependents', async () => {
    const pkg = makePackage({
      dependencies: ['flask'],
      dependencyGroups: {
        dev: ['pytest'],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      {
        name: 'flask',
        version: '3.1.0',
        dependencies: ['werkzeug', 'jinja2'],
      },
      {
        name: 'pytest',
        version: '8.0.0',
        dependencies: ['pluggy'],
      },
      { name: 'werkzeug', version: '3.0.0' },
      { name: 'jinja2', version: '3.1.4', dependencies: ['markupsafe'] },
      { name: 'markupsafe', version: '2.1.5' },
      { name: 'pluggy', version: '1.4.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const werkzeug = manifest.dependencies.find(
      (d: any) => d.name === 'werkzeug'
    );
    expect(werkzeug.type).toBe('transitive');
    expect(werkzeug.scopes).toEqual(['main']);

    // markupsafe is transitively pulled in via flask → jinja2 → markupsafe
    const markupsafe = manifest.dependencies.find(
      (d: any) => d.name === 'markupsafe'
    );
    expect(markupsafe.type).toBe('transitive');
    expect(markupsafe.scopes).toEqual(['main']);

    // pluggy is pulled in by pytest (dev scope)
    const pluggy = manifest.dependencies.find((d: any) => d.name === 'pluggy');
    expect(pluggy.type).toBe('transitive');
    expect(pluggy.scopes).toEqual(['dev']);
  });

  it('transitive deps can have multiple scopes', async () => {
    const pkg = makePackage({
      dependencies: ['flask'],
      dependencyGroups: {
        dev: ['pytest'],
      },
    });

    // Both flask and pytest depend on markupsafe
    const uvLockPath = writeUvLock(tempDir, [
      {
        name: 'flask',
        version: '3.1.0',
        dependencies: ['markupsafe'],
      },
      {
        name: 'pytest',
        version: '8.0.0',
        dependencies: ['markupsafe'],
      },
      { name: 'markupsafe', version: '2.1.5' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const markupsafe = manifest.dependencies.find(
      (d: any) => d.name === 'markupsafe'
    );
    expect(markupsafe.type).toBe('transitive');
    expect(markupsafe.scopes).toEqual(['dev', 'main']);
  });

  it('direct dep in multiple groups gets all scopes', async () => {
    const pkg = makePackage({
      dependencies: ['requests'],
      optionalDependencies: {
        test: ['requests'],
      },
    });

    const uvLockPath = writeUvLock(tempDir, [
      { name: 'requests', version: '2.32.0' },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, DIAGNOSTICS_PATH), 'utf-8')
    );

    const requests = manifest.dependencies.find(
      (d: any) => d.name === 'requests'
    );
    expect(requests.type).toBe('direct');
    expect(requests.scopes).toEqual(['main', 'test']);
  });

  it('includes framework in manifest when provided', async () => {
    const pkg = makePackage({ dependencies: ['fastapi'] });
    const uvLockPath = writeUvLock(tempDir, [
      { name: 'fastapi', version: '0.115.0', dependencies: [] },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
      framework: 'fastapi',
    });

    const manifestPath = path.join(tempDir, DIAGNOSTICS_PATH);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.framework).toBe('fastapi');
  });

  it('omits framework from manifest when not provided', async () => {
    const pkg = makePackage({ dependencies: ['requests'] });
    const uvLockPath = writeUvLock(tempDir, [
      { name: 'requests', version: '2.32.0', dependencies: [] },
    ]);

    await generateProjectManifest({
      workPath: tempDir,
      pythonPackage: pkg,
      pythonVersion,
      uvLockPath,
    });

    const manifestPath = path.join(tempDir, DIAGNOSTICS_PATH);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.framework).toBeUndefined();
  });
});

describe('diagnostics callback', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('returns manifest file when present', async () => {
    // Write a manifest as generateProjectManifest would
    const manifestPath = path.join(tempDir, DIAGNOSTICS_PATH);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const content = JSON.stringify({ version: '20260304', test: true });
    fs.writeFileSync(manifestPath, content);

    const files = await diagnostics({ workPath: tempDir } as any);

    expect(files).toHaveProperty(MANIFEST_FILENAME);
    const blob = files[MANIFEST_FILENAME] as FileBlob;
    expect(blob).toBeInstanceOf(FileBlob);
    expect(JSON.parse(blob.data as string)).toEqual({
      version: '20260304',
      test: true,
    });
  });

  it('returns empty object when no manifest exists', async () => {
    const files = await diagnostics({ workPath: tempDir } as any);
    expect(files).toEqual({});
  });
});
