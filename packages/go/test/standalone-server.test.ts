import { join, dirname, relative } from 'path';
import { mkdirp, writeFile, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { findGoModPath } from '../src/standalone-server';

/**
 * Helper that replicates the buildTarget calculation from buildStandaloneServer.
 * Given a workPath, entrypoint, and modulePath, computes the Go build target.
 */
function computeBuildTarget(
  workPath: string,
  entrypoint: string,
  modulePath: string
): string {
  const relativeEntrypoint = relative(modulePath, join(workPath, entrypoint));
  return relativeEntrypoint === 'main.go'
    ? '.'
    : './' + dirname(relativeEntrypoint);
}

describe('findGoModPath', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `go-standalone-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdirp(tempDir);
  });

  afterEach(async () => {
    await remove(tempDir);
  });

  it('finds go.mod at project root', async () => {
    await writeFile(join(tempDir, 'go.mod'), 'module myapp\n\ngo 1.21\n');

    const result = await findGoModPath(tempDir, tempDir);

    expect(result.goModPath).toBe(join(tempDir, 'go.mod'));
    expect(result.isGoModInRootDir).toBe(true);
  });

  it('finds go.mod in nested service directory', async () => {
    const serviceDir = join(tempDir, 'services', 'go-api');
    await mkdirp(serviceDir);
    await writeFile(join(serviceDir, 'go.mod'), 'module go-api\n\ngo 1.23\n');

    const result = await findGoModPath(serviceDir, tempDir);

    expect(result.goModPath).toBe(join(serviceDir, 'go.mod'));
    expect(result.isGoModInRootDir).toBe(false);
  });

  it('walks up from entrypoint dir to find go.mod in parent', async () => {
    const moduleDir = join(tempDir, 'services', 'go-api');
    const entrypointDir = join(moduleDir, 'cmd', 'server');
    await mkdirp(entrypointDir);
    await writeFile(join(moduleDir, 'go.mod'), 'module go-api\n\ngo 1.23\n');

    const result = await findGoModPath(entrypointDir, tempDir);

    expect(result.goModPath).toBe(join(moduleDir, 'go.mod'));
    expect(result.isGoModInRootDir).toBe(false);
  });

  it('returns undefined goModPath when no go.mod exists', async () => {
    const serviceDir = join(tempDir, 'services', 'go-api');
    await mkdirp(serviceDir);

    const result = await findGoModPath(serviceDir, tempDir);

    expect(result.goModPath).toBeUndefined();
  });

  it('prefers nearest go.mod over root go.mod', async () => {
    // Root go.mod
    await writeFile(join(tempDir, 'go.mod'), 'module root\n\ngo 1.21\n');
    // Nested go.mod
    const serviceDir = join(tempDir, 'services', 'go-api');
    await mkdirp(serviceDir);
    await writeFile(join(serviceDir, 'go.mod'), 'module go-api\n\ngo 1.23\n');

    const result = await findGoModPath(serviceDir, tempDir);

    expect(result.goModPath).toBe(join(serviceDir, 'go.mod'));
    expect(result.isGoModInRootDir).toBe(false);
  });
});

describe('buildTarget computation', () => {
  it('computes "." for main.go at module root', () => {
    const workPath = '/project';
    const entrypoint = 'main.go';
    const modulePath = '/project';

    expect(computeBuildTarget(workPath, entrypoint, modulePath)).toBe('.');
  });

  it('computes "./cmd/api" for nested entrypoint with root module', () => {
    const workPath = '/project';
    const entrypoint = 'cmd/api/main.go';
    const modulePath = '/project';

    expect(computeBuildTarget(workPath, entrypoint, modulePath)).toBe(
      './cmd/api'
    );
  });

  it('computes "." for nested module with main.go at module root', () => {
    // This is the services case: entrypoint=services/go-api/main.go,
    // go.mod at services/go-api/go.mod → modulePath=services/go-api
    const workPath = '/project';
    const entrypoint = 'services/go-api/main.go';
    const modulePath = '/project/services/go-api';

    expect(computeBuildTarget(workPath, entrypoint, modulePath)).toBe('.');
  });

  it('computes relative target for nested module with deeper entrypoint', () => {
    // entrypoint=services/go-api/cmd/server/main.go,
    // go.mod at services/go-api/go.mod → modulePath=services/go-api
    const workPath = '/project';
    const entrypoint = 'services/go-api/cmd/server/main.go';
    const modulePath = '/project/services/go-api';

    expect(computeBuildTarget(workPath, entrypoint, modulePath)).toBe(
      './cmd/server'
    );
  });
});
