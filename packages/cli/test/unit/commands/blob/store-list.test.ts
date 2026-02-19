import { beforeEach, describe, expect, it } from 'vitest';
import createLineIterator from 'line-async-iterator';
import blobCommand from '../../../../src/commands/blob';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams, type Team } from '../../../mocks/team';
import { parseSpacedTableRow } from '../../../helpers/parse-table';

function mockBlobStores(stores: any[]) {
  client.scenario.get('/v1/storage/stores', (_req, res) => {
    res.json({ stores });
  });
}

const mockBlobStore = (overrides: Partial<any> = {}) => ({
  id: 'store_abc123def456gh',
  name: 'my-uploads',
  type: 'blob',
  region: 'iad1',
  size: 2411724,
  count: 142,
  billingState: 'active',
  status: 'available',
  createdAt: Date.now() - 86400000 * 5, // 5 days ago
  updatedAt: Date.now(),
  projectsMetadata: [
    { projectId: 'prj_123', name: 'my-app' },
    { projectId: 'prj_456', name: 'api' },
  ],
  ...overrides,
});

describe('blob store list', () => {
  let team: Team;

  beforeEach(() => {
    useUser();
    const teams = useTeams('team_dummy');
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'blob';
      const subcommand = 'store';
      const subsubcommand = 'list';

      client.setArgv(command, subcommand, subsubcommand, '--help');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:--rw-token',
          value: '[REDACTED]',
        },
        {
          key: 'subcommand:store',
          value: 'store',
        },
        {
          key: 'flag:help',
          value: `${command} ${subcommand}:${subsubcommand}`,
        },
      ]);
    });
  });

  describe('table output', () => {
    it('lists blob stores with correct headers and data', async () => {
      mockBlobStores([
        mockBlobStore({
          id: 'store_abc123def456gh',
          name: 'my-uploads',
          region: 'iad1',
          size: 2411724,
          count: 142,
          billingState: 'active',
          projectsMetadata: [{ projectId: 'prj_123', name: 'my-app' }],
        }),
        mockBlobStore({
          id: 'store_xyz789abc012de',
          name: 'user-avatars',
          region: 'sfo1',
          size: 876544,
          count: 89,
          billingState: 'active',
          projectsMetadata: [],
        }),
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const lines = createLineIterator(client.stderr);

      // Spinner line
      let line = await lines.next();
      expect(line.value).toContain('Fetching blob stores');

      // Header message
      line = await lines.next();
      expect(line.value).toContain(`Blob stores in ${team.slug}:`);

      // Empty line before table
      line = await lines.next();
      expect(line.value).toEqual('');

      // Table headers
      line = await lines.next();
      const headers = parseSpacedTableRow(line.value ?? '');
      expect(headers).toEqual([
        'Name',
        'ID',
        'Status',
        'Region',
        'Size',
        'Files',
        'Projects',
        'Age',
      ]);

      // First data row
      line = await lines.next();
      const row1 = parseSpacedTableRow(line.value ?? '');
      expect(row1[0]).toEqual('my-uploads');
      expect(row1[1]).toEqual('store_abc123def456gh');
      expect(row1[2]).toContain('Active');
      expect(row1[3]).toEqual('iad1');

      // Second data row
      line = await lines.next();
      const row2 = parseSpacedTableRow(line.value ?? '');
      expect(row2[0]).toEqual('user-avatars');
      expect(row2[1]).toEqual('store_xyz789abc012de');
    });

    it('shows "No blob stores found in team-name." for empty list', async () => {
      mockBlobStores([]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput(
        `No blob stores found in ${team.slug}.`
      );
    });

    it('filters out non-blob stores from API response', async () => {
      mockBlobStores([
        mockBlobStore({ name: 'blob-store', type: 'blob' }),
        {
          id: 'store_postgres123',
          name: 'postgres-store',
          type: 'postgres',
          createdAt: Date.now(),
        },
        {
          id: 'store_redis123',
          name: 'redis-store',
          type: 'redis',
          createdAt: Date.now(),
        },
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('blob-store');
      expect(output).not.toContain('postgres-store');
      expect(output).not.toContain('redis-store');
    });

    it('shows dash for stores with no connected projects', async () => {
      mockBlobStores([
        mockBlobStore({
          name: 'unlinked-store',
          projectsMetadata: [],
        }),
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('unlinked-store');
      expect(output).toContain('–'); // en-dash for no projects
    });

    it('truncates projects list with (+N) format', async () => {
      mockBlobStores([
        mockBlobStore({
          name: 'many-projects-store',
          projectsMetadata: [
            { projectId: 'prj_1', name: 'project-one' },
            { projectId: 'prj_2', name: 'project-two' },
            { projectId: 'prj_3', name: 'project-three' },
            { projectId: 'prj_4', name: 'project-four' },
            { projectId: 'prj_5', name: 'project-five' },
          ],
        }),
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('project-one, project-two (+3)');
    });

    it('formats size correctly using bytes()', async () => {
      mockBlobStores([
        mockBlobStore({ name: 'small-store', size: 1024 }),
        mockBlobStore({
          id: 'store_large',
          name: 'large-store',
          size: 1073741824,
        }),
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('1KB');
      expect(output).toContain('1GB');
    });

    it('formats file count with k suffix for large numbers', async () => {
      mockBlobStores([mockBlobStore({ name: 'many-files', count: 12500 })]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('12.5k');
    });
  });

  describe('--no-projects flag', () => {
    it('hides Projects column from table', async () => {
      mockBlobStores([mockBlobStore()]);

      client.setArgv('blob', 'store', 'list', '--no-projects');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const lines = createLineIterator(client.stderr);

      // Skip spinner and header message
      await lines.next();
      await lines.next();
      await lines.next();

      // Table headers
      const line = await lines.next();
      const headers = parseSpacedTableRow(line.value ?? '');
      expect(headers).toEqual([
        'Name',
        'ID',
        'Status',
        'Region',
        'Size',
        'Files',
        'Age',
      ]);
      expect(headers).not.toContain('Projects');
    });

    it('tracks telemetry for flag', async () => {
      mockBlobStores([mockBlobStore()]);

      client.setArgv('blob', 'store', 'list', '--no-projects');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:--rw-token',
          value: '[REDACTED]',
        },
        {
          key: 'subcommand:store',
          value: 'store',
        },
        {
          key: 'subcommand:list',
          value: 'list',
        },
        {
          key: 'flag:no-projects',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--json flag', () => {
    it('outputs stores in JSON format', async () => {
      mockBlobStores([
        mockBlobStore({
          id: 'store_json_test',
          name: 'json-store',
          region: 'cdg1',
          size: 5000,
          count: 10,
          billingState: 'active',
          status: 'available',
          createdAt: 1705420800000,
          updatedAt: 1705507200000,
          projectsMetadata: [{ projectId: 'prj_abc', name: 'test-project' }],
        }),
      ]);

      client.setArgv('blob', 'store', 'list', '--json');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);

      expect(parsed).toMatchObject({
        stores: [
          {
            id: 'store_json_test',
            name: 'json-store',
            region: 'cdg1',
            size: 5000,
            count: 10,
            billingState: 'active',
            status: 'available',
            createdAt: 1705420800000,
            updatedAt: 1705507200000,
            projects: [{ id: 'prj_abc', name: 'test-project' }],
          },
        ],
      });
    });

    it('outputs empty array for no stores', async () => {
      mockBlobStores([]);

      client.setArgv('blob', 'store', 'list', '--json');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      expect(parsed).toEqual({ stores: [] });
    });

    it('tracks telemetry for flag', async () => {
      mockBlobStores([mockBlobStore()]);

      client.setArgv('blob', 'store', 'list', '--json');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:--rw-token',
          value: '[REDACTED]',
        },
        {
          key: 'subcommand:store',
          value: 'store',
        },
        {
          key: 'subcommand:list',
          value: 'list',
        },
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('alias', () => {
    it('works with ls alias', async () => {
      mockBlobStores([mockBlobStore()]);

      client.setArgv('blob', 'store', 'ls');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:--rw-token',
          value: '[REDACTED]',
        },
        {
          key: 'subcommand:store',
          value: 'store',
        },
        {
          key: 'subcommand:list',
          value: 'ls',
        },
      ]);
    });
  });

  describe('errors', () => {
    it('returns error for invalid arguments', async () => {
      mockBlobStores([]);

      client.setArgv('blob', 'store', 'list', 'unexpected-arg');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(1);

      await expect(client.stderr).toOutput('Invalid number of arguments');
    });

    it('returns 1 when API call fails', async () => {
      client.scenario.get('/v1/storage/stores', (_req, res) => {
        res.statusCode = 500;
        res.json({ error: { message: 'Internal server error' } });
      });

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(1);
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand usage', async () => {
      mockBlobStores([]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:--rw-token',
          value: '[REDACTED]',
        },
        {
          key: 'subcommand:store',
          value: 'store',
        },
        {
          key: 'subcommand:list',
          value: 'list',
        },
      ]);
    });
  });

  describe('status display', () => {
    it('shows Active status for active billing state', async () => {
      mockBlobStores([
        mockBlobStore({ name: 'active-store', billingState: 'active' }),
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('Active');
    });

    it('shows Suspended status for suspended billing state', async () => {
      mockBlobStores([
        mockBlobStore({ name: 'suspended-store', billingState: 'suspended' }),
      ]);

      client.setArgv('blob', 'store', 'list');
      const exitCode = await blobCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('Suspended');
    });
  });
});
