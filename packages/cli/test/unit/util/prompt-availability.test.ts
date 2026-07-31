import { describe, expect, it } from 'vitest';

import { client } from '../../mocks/client';

describe('Client prompt availability', () => {
  it('rejects every prompt when explicitly non-interactive despite a TTY', async () => {
    client.nonInteractive = true;
    client.stdin.isTTY = true;

    const unavailable = { name: 'PromptUnavailableError' };
    const choices = [{ name: 'One', value: 'one', key: '1' }];

    await expect(client.input.confirm('Continue?', true)).rejects.toMatchObject(
      unavailable
    );
    await expect(client.input.text({ message: 'Name?' })).rejects.toMatchObject(
      unavailable
    );
    await expect(
      client.input.password({ message: 'Secret?' })
    ).rejects.toMatchObject(unavailable);
    await expect(
      client.input.checkbox({ message: 'Choices?', choices })
    ).rejects.toMatchObject(unavailable);
    await expect(
      client.input.expand({ message: 'Choice?', choices })
    ).rejects.toMatchObject(unavailable);
    await expect(
      client.input.select({ message: 'Choice?', choices })
    ).rejects.toMatchObject(unavailable);
    await expect(
      client.input.search({ message: 'Choice?', source: () => choices })
    ).rejects.toMatchObject(unavailable);
  });
});
