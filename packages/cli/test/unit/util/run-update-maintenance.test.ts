import { beforeEach, describe, expect, it, vi } from 'vitest';
import output from '../../../src/output-manager';
import getUpdateCommand from '../../../src/util/get-update-command';
import { executeUpgrade } from '../../../src/util/upgrade';
import { runUpdateMaintenance } from '../../../src/util/run-update-maintenance';

vi.mock('../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    stopSpinner: vi.fn(),
    error: vi.fn(),
    print: vi.fn(),
  },
}));
vi.mock('../../../src/util/get-update-command', () => ({
  default: vi.fn(),
}));
vi.mock('../../../src/util/upgrade', () => ({
  executeUpgrade: vi.fn(),
}));

function rejectUnsupportedInstall(): never {
  throw new Error('Could not detect a supported global installation');
}

describe('runUpdateMaintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    0,
    1,
    2,
    undefined,
  ])('preserves command exit code %s when notification command resolution fails', async exitCode => {
    vi.mocked(getUpdateCommand).mockImplementation(rejectUnsupportedInstall);
    const result = await runUpdateMaintenance(exitCode, async () => {
      const command = await getUpdateCommand();
      output.print(`Run ${command} to update.`);
      return exitCode;
    });

    expect(result).toBe(exitCode);
    expect(getUpdateCommand).toHaveBeenCalledOnce();
    expect(output.print).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
    expect(output.stopSpinner).toHaveBeenCalledOnce();
    expect(output.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not detect a supported global installation'
      )
    );
  });

  it('preserves success when automatic upgrade throws instead of returning an exit code', async () => {
    vi.mocked(executeUpgrade).mockImplementation(rejectUnsupportedInstall);

    await expect(
      runUpdateMaintenance(0, async () => {
        await executeUpgrade();
        return 0;
      })
    ).resolves.toBe(0);

    expect(executeUpgrade).toHaveBeenCalledOnce();
    expect(output.error).not.toHaveBeenCalled();
    expect(output.stopSpinner).toHaveBeenCalledOnce();
  });

  it.each([
    new Error('Lookup failed'),
    'Lookup failed',
  ])('also isolates other maintenance failures: %s', async error => {
    await expect(
      runUpdateMaintenance(2, async () => {
        throw error;
      })
    ).resolves.toBe(2);
    expect(output.debug).toHaveBeenCalledWith(
      'Post-command update failed; preserving exit code 2: Lookup failed'
    );
  });

  it.each([
    0,
    1,
    2,
    undefined,
  ])('retains an explicitly returned update result of %s', async result => {
    await expect(runUpdateMaintenance(0, async () => result)).resolves.toBe(
      result
    );
    expect(output.stopSpinner).not.toHaveBeenCalled();
    expect(output.debug).not.toHaveBeenCalled();
  });
});
