import { beforeEach, describe, expect, it } from 'vitest';
import connect from '../../../../src/commands/connex';
import { client } from '../../../mocks/client';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('connect contacts add', () => {
  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('adds a contact by connector ID', async () => {
    let requestBody: unknown;
    client.scenario.post(
      '/v1/connect/connectors/:connectorId/contacts',
      (req, res) => {
        expect(req.params.connectorId).toBe('scl_abc123');
        requestBody = req.body;
        res.json({
          status: 'pending',
          verified: false,
          instructions: 'Send a message to complete verification.',
        });
      }
    );

    client.setArgv(
      'connect',
      'contacts',
      'add',
      'scl_abc123',
      '--phone-number',
      '+14156522427'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(requestBody).toEqual({ phoneNumber: '+14156522427' });
    expect(client.stderr.getFullOutput()).toContain(
      'Contact +14156522427 added'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Send a message to complete verification.'
    );
  });

  it('encodes connector UIDs in the API request', async () => {
    client.scenario.post(
      '/v1/connect/connectors/:connectorId/contacts',
      (req, res) => {
        expect(req.params.connectorId).toBe('linq/support');
        res.json({ verified: true });
      }
    );

    client.setArgv(
      'connect',
      'contacts',
      'add',
      'linq/support',
      '--phone-number',
      '+14156522427'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Contact +14156522427 added'
    );
  });

  it('validates required arguments before making a request', async () => {
    client.setArgv('connect', 'contacts', 'add', 'scl_abc123');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Missing phone number');
  });

  it('rejects a phone number that is not E.164', async () => {
    client.setArgv(
      'connect',
      'contacts',
      'add',
      'scl_abc123',
      '--phone-number',
      '415-652-2427'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid phone number');
  });

  it('prints the verification response as JSON', async () => {
    client.scenario.post(
      '/v1/connect/connectors/:connectorId/contacts',
      (_req, res) => {
        res.json({
          status: 'pending',
          verified: false,
          instructions: 'Text us.',
        });
      }
    );
    client.setArgv(
      'connect',
      'contacts',
      'add',
      'scl_abc123',
      '--phone-number',
      '+14156522427',
      '--json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'pending',
      verified: false,
      instructions: 'Text us.',
    });
  });

  it('tracks contacts and add telemetry without recording the phone number', async () => {
    client.scenario.post(
      '/v1/connect/connectors/:connectorId/contacts',
      (_req, res) => res.json({ verified: true })
    );
    client.setArgv(
      'connect',
      'contacts',
      'add',
      'scl_abc123',
      '--phone-number',
      '+14156522427'
    );

    await connect(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:contacts', value: 'contacts' },
      { key: 'subcommand:add', value: 'add' },
      { key: 'argument:connector', value: '[REDACTED]' },
      { key: 'option:phone-number', value: '[REDACTED]' },
    ]);
  });
});
