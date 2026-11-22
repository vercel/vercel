import {
  link,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activateSlot,
  listNativeTrackSlots,
  markPendingProduction,
  readNativeInstallState,
  withNativeInstallLock,
  writeTrackSlot,
} from '../../../src/util/native-install-layout';

async function prepareBinary(directory: string): Promise<void> {
  await writeFile(join(directory, 'vercel'), 'binary');
}

// The curl installer and its atomic symlink layout support macOS and Linux.
describe.skipIf(process.platform === 'win32')(
  'native install track layout',
  () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'vercel-native-layout-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('stages into inactive production slots and atomically selects one', async () => {
      const a = await writeTrackSlot(
        root,
        { track: 'production', version: '1.0.0' },
        prepareBinary
      );
      await activateSlot(root, 'production', a);
      const b = await writeTrackSlot(
        root,
        { track: 'production', version: '2.0.0' },
        prepareBinary
      );
      await markPendingProduction(root, b, '2.0.0');

      expect(a).toBe('a');
      expect(b).toBe('b');
      expect(await readNativeInstallState(root)).toMatchObject({
        track: 'production',
        slot: 'a',
        version: '1.0.0',
        pendingProduction: { slot: 'b', version: '2.0.0' },
      });
      expect(await readlink(join(root, 'active'))).toBe(
        'versions/tracks/production/a'
      );
      expect(await readlink(join(root, 'bin', 'vercel'))).toBe(
        join('..', 'active', 'vercel')
      );

      await activateSlot(root, 'production', b);
      expect(await readNativeInstallState(root)).toMatchObject({
        track: 'production',
        slot: 'b',
        version: '2.0.0',
        pendingProduction: undefined,
      });
    });

    it('preserves the root-active slot when track activation is interrupted', async () => {
      const active = await writeTrackSlot(
        root,
        { track: 'production', version: '1.0.0' },
        prepareBinary
      );
      await activateSlot(root, 'production', active);
      const inactive = await writeTrackSlot(
        root,
        { track: 'production', version: '2.0.0' },
        prepareBinary
      );
      const trackPointer = join(
        root,
        'versions',
        'tracks',
        'production',
        'active'
      );
      await rm(trackPointer);
      await symlink(inactive, trackPointer);

      const selected = await writeTrackSlot(
        root,
        { track: 'production', version: '3.0.0' },
        prepareBinary
      );

      expect(active).toBe('a');
      expect(inactive).toBe('b');
      expect(selected).toBe('b');
      expect(await readNativeInstallState(root)).toMatchObject({
        slot: 'a',
        version: '1.0.0',
      });
    });

    it('selects a PR without changing the selected production slot', async () => {
      const production = await writeTrackSlot(
        root,
        { track: 'production', version: '1.0.0' },
        prepareBinary
      );
      await activateSlot(root, 'production', production);
      const pr = await writeTrackSlot(
        root,
        {
          track: 'pr',
          version: 'pr/123',
          pr: 123,
          buildSha: 'a'.repeat(40),
        },
        prepareBinary
      );
      await activateSlot(root, 'pr', pr);

      expect(await readNativeInstallState(root)).toMatchObject({
        track: 'pr',
        slot: 'a',
        pr: 123,
        buildSha: 'a'.repeat(40),
      });
      expect(
        await readlink(join(root, 'versions', 'tracks', 'production', 'active'))
      ).toBe('a');
    });

    it('keeps each track bounded to a and b and ignores legacy versions', async () => {
      await mkdir(join(root, 'versions', '99.0.0'), { recursive: true });
      await writeFile(join(root, 'versions', '99.0.0', 'vercel'), 'legacy');

      let slot = await writeTrackSlot(
        root,
        { track: 'production', version: '1.0.0' },
        prepareBinary
      );
      await activateSlot(root, 'production', slot);
      slot = await writeTrackSlot(
        root,
        { track: 'production', version: '2.0.0' },
        prepareBinary
      );
      await activateSlot(root, 'production', slot);
      await writeTrackSlot(
        root,
        { track: 'production', version: '3.0.0' },
        prepareBinary
      );

      const installed = await listNativeTrackSlots(root);
      expect(installed).toHaveLength(2);
      expect(installed.map(item => item.version).sort()).toEqual([
        '2.0.0',
        '3.0.0',
      ]);
    });

    it('serializes concurrent installers', async () => {
      let releaseFirst!: () => void;
      const gate = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      const order: string[] = [];

      const first = withNativeInstallLock(root, async () => {
        order.push('first-start');
        await gate;
        order.push('first-end');
      });
      while (!order.length)
        await new Promise(resolve => setTimeout(resolve, 1));
      const second = withNativeInstallLock(root, async () => {
        order.push('second-start');
      });

      await new Promise(resolve => setTimeout(resolve, 75));
      expect(order).toEqual(['first-start']);
      releaseFirst();
      await Promise.all([first, second]);
      expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    });

    it('times out without stealing an abandoned lock', async () => {
      const lock = join(root, 'update.lock');
      const claim = join(root, 'abandoned-claim');
      const owner = JSON.stringify({
        token: 'abandoned',
        pid: 999999,
        createdAt: Date.now() - 11 * 60 * 1000,
      });
      await writeFile(claim, owner);
      await link(claim, lock);
      await rm(claim);

      await expect(
        withNativeInstallLock(root, async () => {}, { waitMs: 20 })
      ).rejects.toThrow(
        `Timed out waiting for another Vercel CLI update. If no update is running, remove the lock at ${lock} and retry.`
      );
      await expect(readFile(lock, 'utf8')).resolves.toBe(owner);
    });

    it('lets background updates exit instead of waiting on the lock', async () => {
      let releaseFirst!: () => void;
      const gate = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      let firstStarted = false;

      const first = withNativeInstallLock(root, async () => {
        firstStarted = true;
        await gate;
      });
      while (!firstStarted)
        await new Promise(resolve => setTimeout(resolve, 1));

      await expect(
        withNativeInstallLock(root, async () => {}, { wait: false })
      ).rejects.toThrow('Native update already in progress');

      releaseFirst();
      await first;
    });

    it('recognizes a shell-installer lock', async () => {
      const lock = join(root, 'update.lock');
      await mkdir(lock);
      await writeFile(
        join(lock, 'owner.json'),
        JSON.stringify({
          token: 'installer-test',
          pid: process.pid,
          createdAt: Date.now(),
        })
      );

      await expect(
        withNativeInstallLock(root, async () => {}, { wait: false })
      ).rejects.toThrow('Native update already in progress');
    });
  }
);
