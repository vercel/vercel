import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalSchedulesSession,
  readLocalSchedulesSessions,
} from '../../../../src/util/dev/schedules-session';

vi.mock('fs/promises', async importOriginal => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
}));

describe('local Schedules session discovery', () => {
  let cwd: string;
  let directory: string;
  const origin = 'http://127.0.0.1:4784';

  beforeEach(async () => {
    cwd = await fs.realpath(
      await fs.mkdtemp(join(tmpdir(), 'vc-schedules-session-'))
    );
    directory = join(cwd, '.vercel', 'dev', 'schedules');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('publishes a complete private descriptor atomically', async () => {
    const rename = fs.rename;
    const publish = vi
      .spyOn(fs, 'rename')
      .mockImplementation(async (from, to) => {
        expect(String(from)).toMatch(/\.tmp$/);
        expect(String(to)).toMatch(/\.json$/);
        expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
        const pending = JSON.parse(await fs.readFile(from, 'utf8'));
        expect(pending).toMatchObject({
          version: 1,
          cwd,
          origin,
          pid: process.pid,
          projectId: 'prj_local',
        });
        await rename(from, to);
      });
    const { session, dispose } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    expect(publish).toHaveBeenCalledOnce();
    expect(await readLocalSchedulesSessions(cwd)).toEqual([session]);
    expect(await fs.readdir(directory)).toEqual([`${session.id}.json`]);
    if (process.platform !== 'win32') {
      expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
      expect(
        (await fs.stat(join(directory, `${session.id}.json`))).mode & 0o777
      ).toBe(0o600);
    }
    await dispose();
    await dispose();
    expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
  });

  it('keeps concurrent instances independent and disposes only its own descriptor', async () => {
    const [first, second] = await Promise.all([
      createLocalSchedulesSession(cwd, origin, 'prj_first'),
      createLocalSchedulesSession(cwd, 'http://127.0.0.1:4785', 'prj_second'),
    ]);
    expect(first.session.id).not.toBe(second.session.id);
    expect(await readLocalSchedulesSessions(cwd)).toEqual(
      expect.arrayContaining([first.session, second.session])
    );
    await first.dispose();
    await first.dispose();
    expect(await readLocalSchedulesSessions(cwd)).toEqual([second.session]);
    await second.dispose();
  });

  it('removes its temporary file when publication fails', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename failed'));
    await expect(
      createLocalSchedulesSession(cwd, origin, 'prj_local')
    ).rejects.toThrow('rename failed');
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it('only reads the exact directory, including its canonical symlink', async () => {
    const alias = `${cwd}-alias`;
    await fs.symlink(cwd, alias, 'dir');
    try {
      const { session, dispose } = await createLocalSchedulesSession(
        alias,
        origin,
        'prj_local'
      );
      expect(session.cwd).toBe(cwd);
      expect(await readLocalSchedulesSessions(alias)).toEqual([session]);
      const child = join(cwd, 'child');
      await fs.mkdir(child);
      expect(await readLocalSchedulesSessions(child)).toEqual([]);
      await dispose();
    } finally {
      await fs.rm(alias, { force: true });
    }
  });

  it('ignores dead PIDs without deleting other descriptors and treats EPERM as alive', async () => {
    const { session } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('dead'), { code: 'ESRCH' });
    });
    expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
    expect(kill).toHaveBeenCalledWith(session.pid, 0);
    expect(await fs.readdir(directory)).toEqual([`${session.id}.json`]);
    kill.mockImplementation(() => {
      throw Object.assign(new Error('permission'), { code: 'EPERM' });
    });
    expect(await readLocalSchedulesSessions(cwd)).toEqual([session]);
  });

  it.each([
    { version: 2 },
    { id: randomUUID() },
    { pid: 0 },
    { pid: -1 },
    { pid: 1.5 },
    { pid: '1' },
    { cwd: '.' },
    { projectId: '' },
    { projectId: null },
    { origin: 'https://127.0.0.1:4784' },
    { origin: 'http://remote.invalid:4784' },
    { origin: 'http://localhost:4784' },
    { origin: 'http://127.0.0.2:4784' },
    { origin: 'http://127.0.0.1' },
    { origin: 'http://127.0.0.1:0' },
    { origin: 'http://127.0.0.1:65536' },
    { origin: 'http://user:password@127.0.0.1:4784' },
    { origin: 'http://127.0.0.1:4784/' },
    { origin: 'http://127.0.0.1:4784/path' },
    { origin: 'http://127.0.0.1:4784?query' },
    { origin: 'http://127.0.0.1:4784#hash' },
    { origin: 'http://127.0.0.1:4784\n' },
  ])('rejects an invalid descriptor rather than guessing: %j', async invalid => {
    const { session } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    const path = join(directory, `${session.id}.json`);
    await fs.writeFile(path, JSON.stringify({ ...session, ...invalid }));
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(path);
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(
      'restart vercel dev in the current directory'
    );
  });

  it('reports malformed JSON and non-UUID filenames', async () => {
    const { session } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    const path = join(directory, `${session.id}.json`);
    await fs.writeFile(path, '{');
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(
      'Stop vercel dev'
    );
    await fs.rename(path, join(directory, 'invalid.json'));
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(
      'UUID filename'
    );
  });

  it('rejects a live descriptor for a different or missing directory', async () => {
    const { session } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    const path = join(directory, `${session.id}.json`);
    const other = join(cwd, 'other');
    await fs.mkdir(other);
    await fs.writeFile(path, JSON.stringify({ ...session, cwd: other }));
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(
      'does not match'
    );
    await fs.rm(other, { recursive: true });
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(
      'Stop vercel dev'
    );
  });

  it('rejects a symlink in place of a descriptor', async () => {
    const { session } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    const path = join(directory, `${session.id}.json`);
    const target = join(cwd, 'descriptor.json');
    await fs.rename(path, target);
    await fs.symlink(target, path);
    await expect(readLocalSchedulesSessions(cwd)).rejects.toThrow(
      'regular session file'
    );
  });

  it('ignores descriptors removed during discovery', async () => {
    const { session, dispose } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    );
    const readdir = fs.readdir;
    vi.spyOn(fs, 'readdir').mockImplementationOnce((async (
      ...args: Parameters<typeof readdir>
    ) => {
      const files = await readdir(...args);
      await dispose();
      return files;
    }) as typeof readdir);
    expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
    expect(await fs.readdir(directory)).not.toContain(`${session.id}.json`);
  });
});
