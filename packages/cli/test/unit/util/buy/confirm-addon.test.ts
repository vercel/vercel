import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { confirmAddon } from '../../../../src/util/buy/confirm-addon';

const summary: [string, string][] = [
  ['Add-on', 'Custom environments'],
  ['Standard price', '$50 per pack per month (USD)'],
];

describe('add-on confirmation', () => {
  it.each([
    'accept',
    'decline',
    'default',
  ] as const)('handles %s with a default of No', async answer => {
    const result = confirmAddon(client, { yes: false, summary });
    await expect(client.stderr).toOutput('$50 per pack per month');
    await expect(client.stderr).toOutput('Enable this add-on?');
    client.stdin.write(
      answer === 'accept' ? 'y\n' : answer === 'decline' ? 'n\n' : '\n'
    );
    expect(await result).toBe(answer === 'accept' ? 'confirmed' : 'declined');
  });

  it('shows pricing even when explicitly accepted with --yes', async () => {
    const prompt = vi.spyOn(client.input, 'confirm');
    expect(
      await confirmAddon(client, { yes: true, summary, asJson: true })
    ).toBe('confirmed');
    expect(prompt).not.toHaveBeenCalled();
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain('$50 per pack per month');
  });

  it.each([
    'non-TTY',
    'non-interactive',
    'JSON',
  ] as const)('requires acceptance in %s mode', async mode => {
    client.stdin.isTTY = mode !== 'non-TTY';
    client.nonInteractive = mode === 'non-interactive';
    const prompt = vi.spyOn(client.input, 'confirm');
    expect(
      await confirmAddon(client, {
        yes: false,
        summary,
        asJson: mode === 'JSON',
      })
    ).toBe('required');
    expect(prompt).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('Use --yes');
    if (mode !== 'non-TTY') {
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        reason: 'confirmation_required',
        summary: { 'Standard price': '$50 per pack per month (USD)' },
      });
    }
  });
});
