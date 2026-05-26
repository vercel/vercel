import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';

describe('domains check', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'check';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
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
    it('prints when the domain is available', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_req, res) => {
          res.json({
            available: true,
          });
        }
      );

      client.setArgv('domains', 'check', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput('is available');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:check',
          value: 'check',
        },
      ]);
    });

    it('prints when the domain is unavailable', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_req, res) => {
          res.json({
            available: false,
          });
        }
      );

      client.setArgv('domains', 'check', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput('is unavailable');
    });

    it('outputs json when requested', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_req, res) => {
          res.json({
            available: true,
          });
        }
      );

      client.setArgv('domains', 'check', 'example.com', '--format=json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toMatchInlineSnapshot(`
        "{
          "domain": "example.com",
          "available": true
        }
        "
      `);
    });

    it('accepts multiple domains and checks bulk availability', async () => {
      useUser();
      let body: { domains?: string[] } | undefined;
      client.scenario.post('/v1/registrar/domains/availability', (req, res) => {
        body = req.body as { domains?: string[] };
        res.json({
          results: [
            { domain: 'one.com', available: true },
            { domain: 'two.com', available: false },
            { domain: 'three.com', available: true },
          ],
        });
      });

      client.setArgv('domains', 'check', 'one.com', 'two.com', 'three.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput('one.com');
      await expect(client.stderr).toOutput('two.com');
      await expect(client.stderr).toOutput('three.com');
      expect(body).toEqual({
        domains: ['one.com', 'two.com', 'three.com'],
      });
    });

    it('outputs json for multiple domains', async () => {
      useUser();
      client.scenario.post(
        '/v1/registrar/domains/availability',
        (_req, res) => {
          res.json({
            results: [
              { domain: 'one.com', available: true },
              { domain: 'two.com', available: false },
            ],
          });
        }
      );

      client.setArgv('domains', 'check', 'one.com', 'two.com', '--format=json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toMatchInlineSnapshot(`
        "{
          "results": [
            {
              "domain": "one.com",
              "available": true
            },
            {
              "domain": "two.com",
              "available": false
            }
          ]
        }
        "
      `);
    });

    it('outputs results array for multiple inputs even with one api result', async () => {
      useUser();
      client.scenario.post(
        '/v1/registrar/domains/availability',
        (_req, res) => {
          res.json({
            results: [{ domain: 'one.com', available: true }],
          });
        }
      );

      client.setArgv('domains', 'check', 'one.com', 'two.com', '--format=json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toMatchInlineSnapshot(`
        "{
          "results": [
            {
              "domain": "one.com",
              "available": true
            }
          ]
        }
        "
      `);
    });
  });
});
