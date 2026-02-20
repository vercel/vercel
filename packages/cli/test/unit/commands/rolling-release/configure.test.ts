import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import rollingRelease from '../../../../src/commands/rolling-release/index';
import { parseDuration } from '../../../../src/commands/rolling-release/configure-rolling-release';
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('parseDuration', () => {
  it('should parse minutes', () => {
    expect(parseDuration('5m')).toBe(5);
    expect(parseDuration('10m')).toBe(10);
  });

  it('should parse hours', () => {
    expect(parseDuration('1h')).toBe(60);
    expect(parseDuration('2h')).toBe(120);
  });

  it('should parse days', () => {
    expect(parseDuration('1d')).toBe(1440);
  });

  it('should treat plain numbers as minutes', () => {
    expect(parseDuration('5')).toBe(5);
    expect(parseDuration('30')).toBe(30);
  });

  it('should return undefined for invalid values', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration('0m')).toBeUndefined();
    expect(parseDuration('-5m')).toBeUndefined();
    expect(parseDuration('5s')).toBeUndefined();
  });
});

describe('rolling-release configure', () => {
  let patchBody: any;
  let patchCalled: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    patchBody = undefined;
    patchCalled = false;

    client.scenario.patch(
      '/v1/projects/:projectId/rolling-release/config',
      (req, res) => {
        patchCalled = true;
        patchBody = req.body;
        res.json({});
      }
    );

    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'proj_123',
        name: 'my-project',
        accountId: 'org_123',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'org_123', slug: 'my-org', type: 'team' },
    });
  });

  describe('--cfg flag (legacy)', () => {
    it('should configure with raw JSON', async () => {
      const cfg = JSON.stringify({
        enabled: true,
        advancementType: 'automatic',
        stages: [
          { targetPercentage: 10, duration: 5 },
          { targetPercentage: 100 },
        ],
      });
      client.setArgv('rolling-release', 'configure', `--cfg=${cfg}`);

      const exitCode = await rollingRelease(client);

      expect(exitCode).toBe(0);
      expect(patchCalled).toBe(true);
    });

    it('should disable with --cfg=disable', async () => {
      client.setArgv('rolling-release', 'configure', '--cfg=disable');

      const exitCode = await rollingRelease(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({ enabled: false });
    });

    it('should error on invalid JSON for --cfg', async () => {
      client.setArgv('rolling-release', 'configure', '--cfg=not-json');

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: Invalid JSON provided for --cfg option.'
      );
      expect(await exitCodePromise).toBe(1);
      expect(patchCalled).toBe(false);
    });
  });

  describe('--disable flag', () => {
    it('should disable rolling releases', async () => {
      client.setArgv('rolling-release', 'configure', '--disable');

      const exitCode = await rollingRelease(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({ enabled: false });
    });
  });

  describe('--enable flag with automatic advancement', () => {
    it('should configure automatic rolling release with stages', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=automatic',
        '--stage=10,5m',
        '--stage=50,10m'
      );

      const exitCode = await rollingRelease(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({
        enabled: true,
        advancementType: 'automatic',
        stages: [
          { targetPercentage: 10, duration: 5 },
          { targetPercentage: 50, duration: 10 },
          { targetPercentage: 100 },
        ],
      });
    });

    it('should parse hour durations', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=automatic',
        '--stage=10,1h'
      );

      const exitCode = await rollingRelease(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({
        enabled: true,
        advancementType: 'automatic',
        stages: [
          { targetPercentage: 10, duration: 60 },
          { targetPercentage: 100 },
        ],
      });
    });
  });

  describe('--enable flag with manual-approval advancement', () => {
    it('should configure manual-approval rolling release with stages', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=manual-approval',
        '--stage=10',
        '--stage=50'
      );

      const exitCode = await rollingRelease(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({
        enabled: true,
        advancementType: 'manual-approval',
        stages: [
          { targetPercentage: 10 },
          { targetPercentage: 50 },
          { targetPercentage: 100 },
        ],
      });
    });
  });

  describe('validation errors', () => {
    it('should error when --enable and --disable are both set', async () => {
      client.setArgv('rolling-release', 'configure', '--enable', '--disable');

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: --enable and --disable are mutually exclusive.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when --enable is used without --advancement-type', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--stage=10,5m'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: --advancement-type is required when using --enable. Must be "automatic" or "manual-approval".'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when --enable is used with invalid --advancement-type', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=invalid',
        '--stage=10,5m'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: --advancement-type is required when using --enable. Must be "automatic" or "manual-approval".'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when --enable is used without --stage', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=automatic'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: At least one --stage is required when using --enable.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when stage percentage is out of range', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=automatic',
        '--stage=100,5m'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: Invalid stage percentage "100". Must be a number between 1 and 99.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when stage percentages are not in ascending order', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=manual-approval',
        '--stage=50',
        '--stage=10'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: Stage percentages must be in ascending order.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when duration is missing for automatic advancement', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=automatic',
        '--stage=10'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: Duration is required for each stage when advancement type is "automatic". Use the format "PERCENTAGE,DURATION" (e.g. "10,5m").'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when duration is provided for manual-approval advancement', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--enable',
        '--advancement-type=manual-approval',
        '--stage=10,5m'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: Duration must not be provided for stages when advancement type is "manual-approval".'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error when --advancement-type is used without --enable or --disable', async () => {
      client.setArgv(
        'rolling-release',
        'configure',
        '--advancement-type=automatic',
        '--stage=10,5m'
      );

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: --enable or --disable is required when using --advancement-type or --stage flags.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should error in non-TTY mode with no flags', async () => {
      client.setArgv('rolling-release', 'configure');
      (client.stdin as any).isTTY = false;

      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Error: Missing configuration flags. Use --enable/--disable with --advancement-type and --stage, or run interactively in a terminal.'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('interactive mode', () => {
    it('should disable via interactive prompt', async () => {
      client.setArgv('rolling-release', 'configure');
      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Would you like to enable or disable rolling releases?'
      );
      client.events.keypress('down'); // select "Disable"
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Successfully disabled');
      expect(await exitCodePromise).toBe(0);
      expect(patchBody).toEqual({ enabled: false });
    });

    it('should enable automatic rolling release via interactive prompt', async () => {
      client.setArgv('rolling-release', 'configure');
      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Would you like to enable or disable rolling releases?'
      );
      client.stdin.write('\n'); // select "Enable" (default)

      await expect(client.stderr).toOutput('How should stages advance?');
      client.stdin.write('\n'); // select "automatic" (default)

      await expect(client.stderr).toOutput(
        'Enter traffic percentage for stage 1'
      );
      client.stdin.write('10\n');

      await expect(client.stderr).toOutput('Enter duration for this stage');
      client.stdin.write('5m\n');

      await expect(client.stderr).toOutput('Add another stage?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Apply this configuration?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Successfully configured');
      expect(await exitCodePromise).toBe(0);
      expect(patchBody).toEqual({
        enabled: true,
        advancementType: 'automatic',
        stages: [
          { targetPercentage: 10, duration: 5 },
          { targetPercentage: 100 },
        ],
      });
    });

    it('should enable manual-approval with multiple stages via interactive prompt', async () => {
      client.setArgv('rolling-release', 'configure');
      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Would you like to enable or disable rolling releases?'
      );
      client.stdin.write('\n'); // select "Enable" (default)

      await expect(client.stderr).toOutput('How should stages advance?');
      client.events.keypress('down'); // select "manual-approval"
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Enter traffic percentage for stage 1'
      );
      client.stdin.write('10\n');

      await expect(client.stderr).toOutput('Add another stage?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Enter traffic percentage for stage 2'
      );
      client.stdin.write('50\n');

      await expect(client.stderr).toOutput('Add another stage?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Apply this configuration?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Successfully configured');
      expect(await exitCodePromise).toBe(0);
      expect(patchBody).toEqual({
        enabled: true,
        advancementType: 'manual-approval',
        stages: [
          { targetPercentage: 10 },
          { targetPercentage: 50 },
          { targetPercentage: 100 },
        ],
      });
    });

    it('should cancel when user declines to apply', async () => {
      client.setArgv('rolling-release', 'configure');
      const exitCodePromise = rollingRelease(client);

      await expect(client.stderr).toOutput(
        'Would you like to enable or disable rolling releases?'
      );
      client.stdin.write('\n'); // select "Enable"

      await expect(client.stderr).toOutput('How should stages advance?');
      client.stdin.write('\n'); // select "automatic"

      await expect(client.stderr).toOutput(
        'Enter traffic percentage for stage 1'
      );
      client.stdin.write('10\n');

      await expect(client.stderr).toOutput('Enter duration for this stage');
      client.stdin.write('5m\n');

      await expect(client.stderr).toOutput('Add another stage?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Apply this configuration?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Configuration cancelled.');
      expect(await exitCodePromise).toBe(0);
      expect(patchCalled).toBe(false);
    });
  });
});
