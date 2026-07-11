import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { confirmProduction } from '../../../../src/commands/curl/confirm-production';

describe('confirmProduction', () => {
  beforeEach(() => {
    client.reset();
    client.stdin.isTTY = true;
  });

  // 1. preview no-prompt
  it('preview deployment is always proceed (no prompt)', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(true);

    const result = await confirmProduction(client, {
      deploymentTarget: 'preview',
      yes: false,
      isTTY: true,
    });

    expect(result).toBe('proceed');
    expect(client.input.confirm).not.toHaveBeenCalled();
  });

  // 2. prod + yes no-prompt
  it('production with --yes is proceed without prompting', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(true);

    const result = await confirmProduction(client, {
      deploymentTarget: 'production',
      yes: true,
      isTTY: true,
    });

    expect(result).toBe('proceed');
    expect(client.input.confirm).not.toHaveBeenCalled();
  });

  // 3. prod non-TTY no-yes fail
  it('production non-TTY without --yes emits actionable error and returns non-tty-no-yes', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(true);

    const result = await confirmProduction(client, {
      deploymentTarget: 'production',
      yes: false,
      isTTY: false,
    });

    expect(result).toBe('non-tty-no-yes');
    expect(client.input.confirm).not.toHaveBeenCalled();
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Use --yes to capture traces on production from non-interactive contexts.'
    );
  });

  // 4. prod TTY confirm
  it('production TTY confirm returns proceed', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(true);

    const result = await confirmProduction(client, {
      deploymentTarget: 'production',
      yes: false,
      isTTY: true,
    });

    expect(result).toBe('proceed');
    expect(client.input.confirm).toHaveBeenCalledTimes(1);
    expect(client.input.confirm).toHaveBeenCalledWith(
      expect.stringContaining('production'),
      false
    );
  });

  // 5. prod TTY decline
  it('production TTY decline returns declined', async () => {
    client.input.confirm = vi.fn().mockResolvedValue(false);

    const result = await confirmProduction(client, {
      deploymentTarget: 'production',
      yes: false,
      isTTY: true,
    });

    expect(result).toBe('declined');
    expect(client.input.confirm).toHaveBeenCalledTimes(1);
  });
});
