import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { buildConfigurePayload } from '../../../../src/commands/rolling-release/configure-rolling-release';

describe('rolling-release configure non-interactive mode', () => {
  beforeEach(() => {
    client.setArgv('rolling-release', 'configure');
  });

  it('errors with message when no flags and non-interactive', async () => {
    client.nonInteractive = true;
    const result = await buildConfigurePayload({
      client,
      cfgString: undefined,
      enableFlag: undefined,
      disableFlag: undefined,
      advancementType: undefined,
      stageFlags: undefined,
    });
    expect(result.exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      'In non-interactive mode use --enable or --disable with --advancement-type and --stage as needed'
    );
  });

  it('succeeds with --disable in non-interactive', async () => {
    client.nonInteractive = true;
    const result = await buildConfigurePayload({
      client,
      cfgString: undefined,
      enableFlag: false,
      disableFlag: true,
      advancementType: undefined,
      stageFlags: undefined,
    });
    expect(result.exitCode).toBeUndefined();
    expect(result.config).toBeUndefined();
  });

  it('succeeds with --enable and flags in non-interactive', async () => {
    client.nonInteractive = true;
    const result = await buildConfigurePayload({
      client,
      cfgString: undefined,
      enableFlag: true,
      disableFlag: false,
      advancementType: 'automatic',
      stageFlags: ['10,5m', '50,10m'],
    });
    expect(result.exitCode).toBeUndefined();
    expect(result.config?.enabled).toBe(true);
    expect(result.config?.advancementType).toBe('automatic');
    expect(result.config?.stages).toHaveLength(3); // 10%, 50%, 100%
  });
});
