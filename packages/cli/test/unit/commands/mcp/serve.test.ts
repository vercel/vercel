import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp';

describe('mcp serve', () => {
  beforeEach(() => {
    client.reset();
  });

  describe('command definition', () => {
    it('mcpCommand includes serve subcommand', async () => {
      const { mcpCommand: cmd } = await import(
        '../../../../src/commands/mcp/command'
      );
      expect(cmd.subcommands).toBeDefined();
      expect(cmd.subcommands).toHaveLength(1);
      expect(cmd.subcommands![0].name).toBe('serve');
    });

    it('serve subcommand has --commands option', async () => {
      const { mcpServeSubcommand } = await import(
        '../../../../src/commands/mcp/command'
      );
      expect(mcpServeSubcommand.name).toBe('serve');
      const commandsOpt = mcpServeSubcommand.options.find(
        (o: { name: string }) => o.name === 'commands'
      );
      expect(commandsOpt).toBeDefined();
      expect(commandsOpt!.deprecated).toBe(false);
    });
  });

  describe('--help for serve subcommand', () => {
    it('displays help and returns 2', async () => {
      client.setArgv('mcp', 'serve', '--help');

      const exitCode = await mcpCommand(client);

      expect(exitCode).toBe(2);
    });
  });
});
