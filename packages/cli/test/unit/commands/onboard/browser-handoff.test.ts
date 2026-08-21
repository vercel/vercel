import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  BrowserHandoffWatcher,
  completePendingHandoffs,
  expirePendingHandoffs,
  HANDOFF_SPOOL_DIRNAME,
  installBrowserBridge,
  isAllowedHandoffUrl,
  unresolvedHandoffs,
} from '../../../../src/commands/onboard/browser-handoff';
import { FOLLOW_UPS } from '../../../../src/commands/onboard/follow-ups';
import { readLedger } from '../../../../src/util/onboard-session';

const run = promisify(execFile);

const CHECKOUT_URL =
  'https://vercel.com/marketplace/checkout?defaultResourceName=db&source=cli';

describe('onboard browser handoff', () => {
  let sessionDir: string;
  let binDir: string;

  beforeEach(async () => {
    sessionDir = await mkdtemp(join(tmpdir(), 'onboard-handoff-test-'));
    binDir = join(sessionDir, 'bin');
    await mkdir(binDir, { recursive: true });
    process.env.VERCEL_ONBOARD_SESSION_DIR = sessionDir;
  });

  afterEach(async () => {
    delete process.env.VERCEL_ONBOARD_SESSION_DIR;
    await rm(sessionDir, { recursive: true, force: true });
  });

  describe('bridge shim', () => {
    it('captures the URL headlessly, with no xdg-open ENOENT possible', async () => {
      const installed = await installBrowserBridge(sessionDir, binDir);
      if (process.platform === 'win32') {
        expect(installed).toBe(false);
        return;
      }
      expect(installed).toBe(true);

      const shim = join(binDir, 'xdg-open');
      expect((await stat(shim)).mode & 0o100).toBeTruthy();

      // Run it the way `open` would, in an environment with no browser.
      const { stdout } = await run('sh', [shim, CHECKOUT_URL], {
        env: { PATH: '/usr/bin:/bin' },
      });
      expect(stdout).toBe('');

      const spooled = await readdir(join(sessionDir, HANDOFF_SPOOL_DIRNAME));
      expect(spooled).toHaveLength(1);
      expect(spooled[0]).toMatch(/\.url$/);
      const captured = await readFile(
        join(sessionDir, HANDOFF_SPOOL_DIRNAME, spooled[0]),
        'utf-8'
      );
      expect(captured).toBe(CHECKOUT_URL);
    });

    it('exits 0 even when the spool directory is gone', async () => {
      if (process.platform === 'win32') return;
      await installBrowserBridge(sessionDir, binDir);
      await rm(join(sessionDir, HANDOFF_SPOOL_DIRNAME), {
        recursive: true,
        force: true,
      });
      // Must not fail the calling command.
      await expect(
        run('sh', [join(binDir, 'xdg-open'), CHECKOUT_URL])
      ).resolves.toBeDefined();
    });
  });

  describe('URL allowlist', () => {
    it('accepts only https URLs on Vercel-owned hosts', () => {
      expect(isAllowedHandoffUrl(CHECKOUT_URL)).toBe(true);
      expect(isAllowedHandoffUrl('https://api.vercel.com/x')).toBe(true);
      expect(isAllowedHandoffUrl('http://vercel.com/x')).toBe(false);
      expect(isAllowedHandoffUrl('https://evil.example.com/vercel.com')).toBe(
        false
      );
      expect(isAllowedHandoffUrl('https://notvercel.com/x')).toBe(false);
      expect(isAllowedHandoffUrl('file:///etc/passwd')).toBe(false);
      expect(isAllowedHandoffUrl('not a url')).toBe(false);
    });
  });

  describe('watcher', () => {
    async function spool(url: string, name = 'handoff-abc.url') {
      const dir = join(sessionDir, HANDOFF_SPOOL_DIRNAME);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), url);
    }

    it('journals the handoff and hands the URL to the renderer', async () => {
      await spool(CHECKOUT_URL);
      const onHandoff = vi.fn();
      const watcher = new BrowserHandoffWatcher(sessionDir, onHandoff);

      await watcher.scan();

      expect(onHandoff).toHaveBeenCalledWith(CHECKOUT_URL);
      const ledger = await readLedger(sessionDir);
      expect(ledger).toEqual([
        expect.objectContaining({
          type: 'browser-handoff',
          url: CHECKOUT_URL,
          status: 'waiting',
        }),
      ]);
      // Consumed: the spool file is gone and a rescan does nothing.
      await watcher.scan();
      expect(onHandoff).toHaveBeenCalledTimes(1);
    });

    it('drops disallowed URLs without journaling or rendering', async () => {
      await spool('http://vercel.com/insecure', 'handoff-a.url');
      await spool('https://evil.example.com/', 'handoff-b.url');
      const onHandoff = vi.fn();
      const watcher = new BrowserHandoffWatcher(sessionDir, onHandoff);

      await watcher.scan();

      expect(onHandoff).not.toHaveBeenCalled();
      expect(await readLedger(sessionDir)).toEqual([]);
    });
  });

  describe('lifecycle', () => {
    async function journal(status: string, url = CHECKOUT_URL) {
      const { recordSessionEvent } = await import(
        '../../../../src/util/onboard-session'
      );
      recordSessionEvent({ type: 'browser-handoff', url, status });
    }

    it('expires pending handoffs at teardown, resumably', async () => {
      await journal('waiting');
      await expirePendingHandoffs(sessionDir);

      const ledger = await readLedger(sessionDir);
      expect(ledger.at(-1)).toMatchObject({ status: 'expired' });
      // Still unresolved: a resumed session must offer to continue it.
      expect(unresolvedHandoffs(ledger)).toEqual([CHECKOUT_URL]);
    });

    it('completes pending handoffs when the user continues setup', async () => {
      await journal('waiting');
      await journal('expired');
      await completePendingHandoffs(sessionDir);

      const ledger = await readLedger(sessionDir);
      expect(ledger.at(-1)).toMatchObject({ status: 'completed' });
      expect(unresolvedHandoffs(ledger)).toEqual([]);
      // Idempotent: nothing left to complete.
      await completePendingHandoffs(sessionDir);
      expect(await readLedger(sessionDir)).toHaveLength(3);
    });

    it('offers the continue-provider-setup follow-up only while unresolved, and it verifies before provisioning', async () => {
      await journal('waiting');
      const ledger = await readLedger(sessionDir);
      const followUp = FOLLOW_UPS.find(
        entry => entry.id === 'continue-provider-setup'
      );
      expect(followUp).toBeDefined();
      expect(followUp!.available(ledger)).toBe(true);
      // The resumption prompt guards against duplicate resources.
      expect(followUp!.prompt(ledger)).toContain('already exist');
      expect(followUp!.prompt(ledger)).toContain('Never create a duplicate');

      await completePendingHandoffs(sessionDir);
      expect(followUp!.available(await readLedger(sessionDir))).toBe(false);
    });
  });
});
