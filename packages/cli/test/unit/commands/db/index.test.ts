import { beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../../../src/commands/db';

const { mockQuery, mockShell } = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue(0),
  mockShell: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../../../src/commands/db/query', () => ({
  default: mockQuery,
}));

vi.mock('../../../../src/commands/db/shell', () => ({
  default: mockShell,
}));

function createClient(argv: string[]) {
  return {
    argv: [process.execPath, 'cli.js', ...argv],
    stderr: { columns: 80, getFullOutput: vi.fn(() => '') },
  } as any;
}

describe('db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes query subcommand', async () => {
    const client = createClient(['db', 'query', 'select 1']);

    const exitCode = await db(client);

    expect(exitCode).toBe(0);
    expect(mockQuery).toHaveBeenCalledWith(client, ['select 1']);
    expect(mockShell).not.toHaveBeenCalled();
  });

  it('routes shell subcommand', async () => {
    const client = createClient(['db', 'shell']);

    const exitCode = await db(client);

    expect(exitCode).toBe(0);
    expect(mockShell).toHaveBeenCalledWith(client, []);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('prints command help', async () => {
    const client = createClient(['db', '--help']);

    const exitCode = await db(client);

    expect(exitCode).toBe(2);
  });
});
