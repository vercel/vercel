import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import login from '../../../src/commands/login';
import { emoji } from '../../../src/util/emoji';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { vi } from 'vitest';

vi.setConfig({ testTimeout: 10000 });

describe('login', () => {
  it('should not allow the `--token` flag', async () => {
    client.setArgv('login', '--token', 'foo');
    const exitCodePromise = login(client);
    await expect(client.stderr).toOutput(
      'Error: `--token` may not be used with the "login" command\n'
    );
    await expect(exitCodePromise).resolves.toEqual(2);
  });

  it('should allow login via email as argument', async () => {
    const user = useUser();
    client.setArgv('login', user.email);
    const exitCodePromise = login(client);
    await expect(client.stderr).toOutput(
      `Success! Email authentication complete for ${user.email}`
    );
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  describe('northstar', () => {
    it('should set currentTeam to defaultTeamId', async () => {
      const user = useUser({
        version: 'northstar',
        defaultTeamId: 'northstar-defaultTeamId',
      });
      client.authConfig.token = undefined;
      client.setArgv('login', user.email);
      const exitCodePromise = login(client);
      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.config.currentTeam).toEqual(
        'northstar-defaultTeamId'
      );
    });
  });

  describe('interactive', () => {
    it('should allow login via email', async () => {
      const user = useUser();
      client.setArgv('login');
      const exitCodePromise = login(client);
      await expect(client.stderr).toOutput(`? Log in to Vercel`);

      // Move down to "Email" option
      client.events.keypress('down');
      client.events.keypress('down');
      client.events.keypress('down');
      client.events.keypress('enter');

      await expect(client.stderr).toOutput('? Enter your email address:');

      client.stdin.write(`${user.email}\n`);

      await expect(client.stderr).toOutput(
        `Success! Email authentication complete for ${user.email}`
      );

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should allow the `--no-color` flag', async () => {
      const user = useUser();
      client.setArgv('login', '--no-color');
      const exitCodePromise = login(client);
      await expect(client.stderr).toOutput(`? Log in to Vercel`);

      // Move down to "Email" option
      client.events.keypress('down');
      client.events.keypress('down');
      client.events.keypress('down');
      client.events.keypress('enter');

      await expect(client.stderr).toOutput('? Enter your email address:');

      client.stdin.write(`${user.email}\n`);

      await expect(client.stderr).toOutput(
        `Success! Email authentication complete for ${user.email}`
      );

      await expect(client.getFullOutput()).not.toContain(emoji('tip'));

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    describe('with NO_COLOR="1" env var', () => {
      let previousNoColor: string | undefined;

      beforeEach(() => {
        previousNoColor = process.env.NO_COLOR;
        process.env.NO_COLOR = '1';
      });

      afterEach(() => {
        delete process.env.NO_COLOR;
        if (previousNoColor) {
          process.env.NO_COLOR = previousNoColor;
        }
      });

      it('should remove emoji the `NO_COLOR` env var with 1', async () => {
        client.resetOutput();

        const user = useUser();
        client.setArgv('login');
        const exitCodePromise = login(client);
        await expect(client.stderr).toOutput(`? Log in to Vercel`);

        // Move down to "Email" option
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\r'); // Return key

        await expect(client.stderr).toOutput('? Enter your email address:');

        client.stdin.write(`${user.email}\n`);

        await expect(client.stderr).toOutput(
          `Success! Email authentication complete for ${user.email}`
        );

        await expect(client.stderr).not.toOutput(emoji('tip'));

        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });

    describe('with FORCE_COLOR="0" env var', () => {
      let previousForceColor: string | undefined;

      beforeEach(() => {
        previousForceColor = process.env.FORCE_COLOR;
        process.env.FORCE_COLOR = '0';
      });

      afterEach(() => {
        delete process.env.FORCE_COLOR;
        if (previousForceColor) {
          process.env.FORCE_COLOR = previousForceColor;
        }
      });

      it('should remove emoji the `FORCE_COLOR` env var with 0', async () => {
        client.resetOutput();

        const user = useUser();
        client.setArgv('login');
        const exitCodePromise = login(client);
        await expect(client.stderr).toOutput(`? Log in to Vercel`);

        // Move down to "Email" option
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\x1B[B'); // Down arrow
        client.stdin.write('\r'); // Return key

        await expect(client.stderr).toOutput('? Enter your email address:');

        client.stdin.write(`${user.email}\n`);

        await expect(client.stderr).toOutput(
          `Success! Email authentication complete for ${user.email}`
        );

        await expect(client.stderr).not.toOutput(emoji('tip'));
        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });
  });
});
