import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { help } from '../../../../src/commands/help';
import schedules from '../../../../src/commands/schedules';
import {
  executionsListSubcommand,
  schedulesCommand,
} from '../../../../src/commands/schedules/command';
import { requireProjectContext } from '../../../../src/util/projects/require-project-context';
import { createLocalSchedulesClient } from '../../../../src/util/schedules/local-client';
import { client } from '../../../mocks/client';

vi.mock('../../../../src/util/schedules/local-client', () => ({
  createLocalSchedulesClient: vi.fn(),
}));
vi.mock('../../../../src/util/projects/require-project-context', () => ({
  requireProjectContext: vi.fn(),
}));

describe('schedules local help', () => {
  beforeEach(() => {
    vi.mocked(createLocalSchedulesClient).mockReset();
    vi.mocked(requireProjectContext).mockReset();
  });

  describe.each(['--local', '-L'])('telemetry with %s', flag => {
    it.each([
      { argv: [flag, 'schedules'] },
      { argv: ['schedules', flag] },
    ])('records local once for group-only help: $argv', async ({ argv }) => {
      client.setArgv(...argv);
      await expect(schedules(client)).resolves.toBe(0);
      expect(
        client.telemetryEventStore.readonlyEvents.filter(
          event => event.key === 'flag:local'
        )
      ).toEqual([expect.objectContaining({ value: 'TRUE' })]);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        'vercel schedules'
      );
      expect(createLocalSchedulesClient).not.toHaveBeenCalled();
      expect(requireProjectContext).not.toHaveBeenCalled();
    });

    it.each(
      [
        ['schedules'],
        ['schedules', 'list'],
        ['schedules', 'ls'],
        ['schedules', 'inspect'],
        ['schedules', 'get'],
        ['schedules', 'executions'],
        ['schedules', 'executions', 'list'],
        ['schedules', 'executions', 'ls'],
      ].flatMap(command =>
        ['--help', '-h'].flatMap(helpFlag => {
          const args = [...command, helpFlag];
          return Array.from({ length: args.length + 1 }, (_, position) => {
            const argv = [...args];
            argv.splice(position, 0, flag);
            return { argv, command };
          });
        })
      )
    )('records local once and exits successfully: $argv', async ({
      argv,
      command,
    }) => {
      client.setArgv(...argv);
      await expect(schedules(client)).resolves.toBe(0);
      expect(
        client.telemetryEventStore.readonlyEvents.filter(
          event => event.key === 'flag:local'
        )
      ).toEqual([expect.objectContaining({ value: 'TRUE' })]);
      const canonicalCommand = command.map(part =>
        part === 'get' ? 'inspect' : part === 'ls' ? 'list' : part
      );
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        `vercel ${canonicalCommand.join(' ')}`
      );
      expect(createLocalSchedulesClient).not.toHaveBeenCalled();
      expect(requireProjectContext).not.toHaveBeenCalled();
    });
  });

  it('documents local mode on the group', () => {
    expect(
      help(schedulesCommand, { stream: { isTTY: false }, columns: 80 })
    ).toMatchSnapshot();
  });

  it.each(
    schedulesCommand.subcommands
  )('documents local mode on $name', command => {
    const text = help(command, {
      stream: { isTTY: false },
      parent: schedulesCommand,
      columns: 80,
    });
    expect(text).toContain('--local');
    // `-L` still parses, but help no longer teaches it.
    expect(text).not.toContain('-L,');
    expect(text).toMatchSnapshot();
  });

  it('documents the parsed flag on nested execution history', () => {
    expect(
      help(executionsListSubcommand, {
        stream: { isTTY: false },
        parent: { ...schedulesCommand, name: 'schedules executions' },
        columns: 80,
      })
    ).toMatchSnapshot();
  });
});
