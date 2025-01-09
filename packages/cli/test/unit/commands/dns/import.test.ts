import { describe, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type fs, vol } from 'memfs';
import { client } from '../../../mocks/client';
import dns from '../../../../src/commands/dns';
import { useUser } from '../../../mocks/user';
import { useDns } from '../../../mocks/dns';

describe('dns import', () => {
  beforeEach(() => {
    useUser();
    useDns();
  });

  vi.mock('node:fs/promises', async () => {
    const memfs: { fs: typeof fs } = await vi.importActual('memfs');
    return memfs.fs.promises;
  });

  vi.mock('node:fs', async () => {
    const memfs: { fs: typeof fs } = await vi.importActual('memfs');
    return memfs;
  });

  afterEach(() => {
    vol.reset();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';
      const subcommand = 'import';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('[domain]', () => {
    describe('[zonefile]', () => {
      it('tracks telemetry', async () => {
        client.scenario.put('/v3/domains/:domain?/records', (req, res) => {
          res.json({
            recordIds: [],
          });
        });
        const json = {
          '/path/to/file': '',
        };
        vol.fromJSON(json);
        client.setArgv('dns', 'import', 'example.com', '/path/to/file');
        const exitCode = await dns(client);
        expect(exitCode, 'exit code for "dns"').toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:import',
            value: 'import',
          },
          {
            key: 'argument:domain',
            value: '[REDACTED]',
          },
          {
            key: 'argument:zoneFilePath',
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });
});
