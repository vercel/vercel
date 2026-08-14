import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import activity from '../../../../src/commands/activity';

describe('activity types', () => {
  beforeEach(() => {
    client.reset();
  });

  it('prints event types as a table with deprecation status', async () => {
    client.scenario.get('/v1/events/types', (_req, res) => {
      res.json({
        types: [
          {
            name: 'login',
            description: 'User logged in',
          },
          {
            name: 'team-member-add',
            description: 'A team member was added',
            deprecated: true,
          },
        ],
      });
    });

    client.setArgv('activity', 'types');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Name');
    expect(output).toContain('Description');
    expect(output).toContain('login');
    expect(output).toContain('team-member-add');
    expect(output).toContain('A team member was added (Deprecated)');
  });

  it('prints raw JSON output with --format=json including deprecated types', async () => {
    client.scenario.get('/v1/events/types', (_req, res) => {
      res.json({
        types: [
          {
            name: 'login',
            description: 'User logged in',
          },
          {
            name: 'team-member-add',
            description: 'A team member was added',
            deprecated: true,
          },
        ],
      });
    });

    client.setArgv('activity', 'types', '--format=json');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      types: [
        {
          name: 'login',
          description: 'User logged in',
        },
        {
          name: 'team-member-add',
          description: 'A team member was added',
          deprecated: true,
        },
      ],
    });
  });

  it('returns permission guidance for 403 errors', async () => {
    client.scenario.get('/v1/events/types', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'forbidden',
        },
      });
    });

    client.setArgv('activity', 'types');

    const exitCode = await activity(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You do not have permission to list activity event types'
    );
  });
});
