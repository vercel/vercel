import { describe, expect, it } from 'vitest';
import {
  blobCommand,
  copySubcommand,
  delSubcommand,
  deleteStoreSubcommand,
  emptyStoreSubcommand,
  getStoreInfoSubcommand,
  getSubcommand,
  listSubcommand,
  presignSubcommand,
  putSubcommand,
  signedTokenSubcommand,
} from '../../../../src/commands/blob/command';

const AUTH_OPTION_NAMES = ['rw-token', 'oidc-token', 'store-id'] as const;

// Every subcommand that authenticates against a Blob store must document
// the shared auth options in its own help output, since subcommand help
// does not render parent command options.
const authConsumingSubcommands = [
  listSubcommand,
  putSubcommand,
  getSubcommand,
  delSubcommand,
  copySubcommand,
  signedTokenSubcommand,
  presignSubcommand,
  deleteStoreSubcommand,
  getStoreInfoSubcommand,
  emptyStoreSubcommand,
];

describe('blob command definitions', () => {
  it.each(authConsumingSubcommands.map(sub => [sub.name, sub] as const))(
    '%s subcommand documents the Blob auth options',
    (_name, subcommand) => {
      const optionNames = subcommand.options.map(option => option.name);
      for (const authOption of AUTH_OPTION_NAMES) {
        expect(optionNames).toContain(authOption);
      }
    }
  );

  it('blob command documents the Blob auth options', () => {
    const optionNames = blobCommand.options.map(option => option.name);
    for (const authOption of AUTH_OPTION_NAMES) {
      expect(optionNames).toContain(authOption);
    }
  });
});
