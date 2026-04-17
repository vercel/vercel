import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { base64url, EncryptJWT, jwtDecrypt } from 'jose';
import flags from '../../../../src/commands/flags';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

// A valid 32-byte base64url-encoded key for testing
const TEST_SECRET = base64url.encode(
  new Uint8Array(32).fill(0).map((_, i) => i)
);

describe('flags override', () => {
  let originalFlagsSecret: string | undefined;

  beforeEach(() => {
    originalFlagsSecret = process.env.FLAGS_SECRET;
    delete process.env.FLAGS_SECRET;

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
  });

  afterEach(() => {
    if (originalFlagsSecret !== undefined) {
      process.env.FLAGS_SECRET = originalFlagsSecret;
    } else {
      delete process.env.FLAGS_SECRET;
    }
  });

  describe('--help', () => {
    it('prints help and returns exit code 2', async () => {
      client.setArgv('flags', 'override', '--help');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
    });

    it('tracks telemetry', async () => {
      client.setArgv('flags', 'override', '--help');
      await flags(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'flags:override',
        },
      ]);
    });
  });

  describe('with FLAGS_SECRET in environment', () => {
    beforeEach(() => {
      process.env.FLAGS_SECRET = TEST_SECRET;
    });

    it('encrypts a single boolean override', async () => {
      client.setArgv('flags', 'override', 'my-flag=true');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput().trim();

      // Decrypt and verify
      const secret = base64url.decode(TEST_SECRET);
      const { payload } = await jwtDecrypt(output, secret);
      expect(payload.o).toEqual({ 'my-flag': true });
      expect(payload.pur).toEqual('overrides');
    });

    it('encrypts multiple overrides with type coercion', async () => {
      client.setArgv(
        'flags',
        'override',
        'bool-flag=true',
        'str-flag=hello',
        'num-flag=42',
        'false-flag=false'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput().trim();
      const secret = base64url.decode(TEST_SECRET);
      const { payload } = await jwtDecrypt(output, secret);
      expect(payload.o).toEqual({
        'bool-flag': true,
        'str-flag': 'hello',
        'num-flag': 42,
        'false-flag': false,
      });
    });

    it('handles values containing = signs', async () => {
      client.setArgv('flags', 'override', 'my-flag=a=b=c');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput().trim();
      const secret = base64url.decode(TEST_SECRET);
      const { payload } = await jwtDecrypt(output, secret);
      expect(payload.o).toEqual({ 'my-flag': 'a=b=c' });
    });

    it('errors when no overrides are provided', async () => {
      client.setArgv('flags', 'override');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Please provide at least one flag override');
    });

    it('errors on invalid format (no = sign)', async () => {
      client.setArgv('flags', 'override', 'invalid-arg');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Invalid override format');
    });

    it('supports custom --expiration', async () => {
      client.setArgv(
        'flags',
        'override',
        'my-flag=true',
        '--expiration',
        '30d'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput().trim();
      const secret = base64url.decode(TEST_SECRET);
      const { payload } = await jwtDecrypt(output, secret);
      expect(payload.o).toEqual({ 'my-flag': true });
      // Verify expiration is roughly 30 days from now
      expect(payload.exp).toBeDefined();
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      const now = Math.floor(Date.now() / 1000);
      expect(payload.exp).toBeGreaterThan(now + thirtyDaysInSeconds - 60);
      expect(payload.exp).toBeLessThan(now + thirtyDaysInSeconds + 60);
    });
  });

  describe('missing FLAGS_SECRET', () => {
    it('errors when no secret is available', async () => {
      client.setArgv('flags', 'override', 'my-flag=true');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('FLAGS_SECRET not found');
    });
  });

  describe('invalid FLAGS_SECRET', () => {
    it('errors when secret is not 32 bytes', async () => {
      process.env.FLAGS_SECRET = base64url.encode(new Uint8Array(16).fill(0));

      client.setArgv('flags', 'override', 'my-flag=true');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('256-bit');
    });
  });

  it('tracks subcommand telemetry', async () => {
    process.env.FLAGS_SECRET = TEST_SECRET;
    client.setArgv('flags', 'override', 'my-flag=true');
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:override',
        value: 'override',
      },
    ]);
  });

  describe('--decrypt', () => {
    async function createToken(
      overrides: Record<string, unknown>,
      secret: string = TEST_SECRET
    ): Promise<string> {
      const encodedSecret = base64url.decode(secret);
      return new EncryptJWT({ o: overrides, pur: 'overrides' })
        .setExpirationTime('1y')
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(encodedSecret);
    }

    beforeEach(() => {
      process.env.FLAGS_SECRET = TEST_SECRET;
    });

    it('decrypts a token and prints JSON', async () => {
      const token = await createToken({
        'my-flag': true,
        'other-flag': 'hello',
      });
      client.setArgv('flags', 'override', '--decrypt', token);
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = JSON.parse(client.stdout.getFullOutput().trim());
      expect(output).toEqual({ 'my-flag': true, 'other-flag': 'hello' });
    });

    it('decrypts a token with numeric values', async () => {
      const token = await createToken({ 'num-flag': 42 });
      client.setArgv('flags', 'override', '--decrypt', token);
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = JSON.parse(client.stdout.getFullOutput().trim());
      expect(output).toEqual({ 'num-flag': 42 });
    });

    it('errors when FLAGS_SECRET is missing', async () => {
      delete process.env.FLAGS_SECRET;
      const token = await createToken({ 'my-flag': true });
      client.setArgv('flags', 'override', '--decrypt', token);
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('FLAGS_SECRET not found');
    });

    it('errors on invalid token', async () => {
      client.setArgv('flags', 'override', '--decrypt', 'not-a-valid-token');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
    });

    it('errors when token has wrong purpose', async () => {
      const encodedSecret = base64url.decode(TEST_SECRET);
      const token = await new EncryptJWT({ o: { flag: true }, pur: 'wrong' })
        .setExpirationTime('1y')
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(encodedSecret);

      client.setArgv('flags', 'override', '--decrypt', token);
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('not a valid flag overrides token');
    });
  });
});
