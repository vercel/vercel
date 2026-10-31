import { mkdtemp, mkdir, writeFile, symlink, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDaemonStaticFileFilter } from '../src/daemon-static-publishing';

describe('daemon static publishing', () => {
  let project: string;
  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    project = await mkdtemp(join(tmpdir(), 'daemon-static-'));
    for (const file of [
      'Dockerfile',
      'index.html',
      'backend/Dockerfile',
      'backend/server.py',
      'public/index.html',
      'apps/Dockerfile',
      'apps/web/dist/index.html',
    ]) {
      const path = join(project, file);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, file);
    }
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(project, { recursive: true, force: true });
  });

  function filter(daemonRoot: string, publish: string) {
    return createDaemonStaticFileFilter({
      context: {
        projectRoot: project,
        daemons: {
          worker: {
            root: daemonRoot,
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
          },
        },
      },
      publishPath: join(project, publish),
    });
  }

  it.each([
    ['.', '.'],
    ['backend', './backend/'],
    ['apps', 'apps'],
  ])('rejects publishing daemon root %s as %s', async (daemon, publish) => {
    await expect(filter(daemon, publish)).rejects.toMatchObject({
      code: 'INVALID_DAEMON_ROOT',
    });
  });

  it('excludes nested sources and preserves other files', async () => {
    const canPublish = await filter('backend', '.');
    expect(await canPublish(join(project, 'backend/server.py'))).toBe(false);
    expect(await canPublish(join(project, 'backend/Dockerfile'))).toBe(false);
    expect(await canPublish(join(project, 'index.html'))).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: Skipping static files under daemon roots. To publish them intentionally, copy them into a separate build output directory.'
    );
  });

  it('allows a selected output directory in a shared context', async () => {
    expect(
      await (await filter('.', 'public'))(join(project, 'public/index.html'))
    ).toBe(true);
    expect(
      await (await filter('apps', 'apps/web/dist'))(
        join(project, 'apps/web/dist/index.html')
      )
    ).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    '.',
    'backend',
  ])('still excludes daemon sources when the output directory does not exist (daemon root "%s")', async daemon => {
    const canPublish = await filter(daemon, 'missing');
    expect(await canPublish(join(project, 'backend/server.py'))).toBe(false);
  });

  it.each([
    'backend',
    '.',
  ])('excludes symlinks from public into daemon %s', async daemon => {
    await symlink(
      join(project, 'backend/server.py'),
      join(project, 'public/renamed.txt')
    );
    await symlink(join(project, 'backend'), join(project, 'public/linked'));
    const canPublish = await filter(daemon, 'public');
    expect(await canPublish(join(project, 'public/renamed.txt'))).toBe(false);
    expect(await canPublish(join(project, 'public/linked/server.py'))).toBe(
      false
    );
  });

  it('canonicalizes daemon roots, publish directories, and the project path', async () => {
    await symlink(join(project, 'backend'), join(project, 'worker'));
    await symlink(join(project, 'backend'), join(project, 'publish'));
    const canPublish = await filter('worker', '.');
    expect(await canPublish(join(project, 'backend/server.py'))).toBe(false);
    await expect(filter('worker', 'publish')).rejects.toMatchObject({
      code: 'INVALID_DAEMON_ROOT',
    });
    await symlink(project, join(project, 'alias'));
    const aliasFilter = await createDaemonStaticFileFilter({
      context: {
        projectRoot: join(project, 'alias'),
        daemons: {
          worker: { root: 'backend', entrypoint: 'Dockerfile', instances: {} },
        },
      },
      publishPath: join(project, 'alias'),
    });
    expect(await aliasFilter(join(project, 'backend/server.py'))).toBe(false);
  });

  it('excludes Dockerfile aliases even inside an allowed public directory', async () => {
    await symlink(
      join(project, 'Dockerfile'),
      join(project, 'public/image.txt')
    );
    expect(
      await (await filter('.', 'public'))(join(project, 'public/image.txt'))
    ).toBe(false);
  });

  it('fails on unresolved source paths', async () => {
    const canPublish = await filter('backend', 'public');
    await expect(canPublish(join(project, 'missing'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('excludes directory aliases to ancestors of daemon roots without following cycles', async () => {
    await symlink(project, join(project, 'public/shared'));
    const canPublish = await filter('backend', 'public');
    expect(await canPublish(join(project, 'public/shared'))).toBe(false);
  });

  it('allows shared contexts while excluding another daemon nested in public output', async () => {
    await mkdir(join(project, 'public/worker'), { recursive: true });
    await writeFile(join(project, 'public/worker/Dockerfile'), 'FROM scratch');
    await writeFile(join(project, 'public/worker/main.py'), 'private');
    const canPublish = await createDaemonStaticFileFilter({
      context: {
        projectRoot: project,
        daemons: {
          shared: { root: '.', entrypoint: 'Dockerfile', instances: {} },
          nested: {
            root: 'public/worker',
            entrypoint: 'Dockerfile',
            instances: {},
          },
        },
      },
      publishPath: join(project, 'public'),
    });
    expect(await canPublish(join(project, 'public/index.html'))).toBe(true);
    expect(await canPublish(join(project, 'public/worker/main.py'))).toBe(
      false
    );
  });
});
