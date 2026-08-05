export type GateClass = 'spend' | 'production' | 'remote-delete';

export interface GatedOperation {
  gate: GateClass;
  /** One line explaining what approval grants, shown beside the command. */
  description: string;
}

/**
 * Aliases a gated command can be invoked under. The dispatcher hands us the
 * canonical name, but the raw argv carries whatever the agent typed, and the
 * subcommand is found relative to that token.
 */
const COMMAND_TOKENS: Record<string, string[]> = {
  deploy: ['deploy'],
  promote: ['promote'],
  rollback: ['rollback'],
  integration: ['integration', 'integrations'],
  'integration-resource': ['integration-resource', 'integration-resources'],
  project: ['project', 'projects'],
  domains: ['domains', 'domain'],
};

/**
 * Decide whether a command needs the user's explicit approval.
 *
 * `command` is the canonical name the dispatcher resolved; `argv` is the raw
 * arguments starting at the command token. Deliberately narrow: every gate is
 * an interruption, and a gate that fires on routine commands trains the user
 * to approve without reading. Three classes only — spending money, touching
 * production, and irreversibly deleting remote state.
 *
 * When in doubt the classifier errs toward gating: a spurious prompt costs a
 * keystroke, a missed one costs money.
 */
export function classifyGatedOperation(
  command: string,
  argv: string[]
): GatedOperation | undefined {
  // Asking what a command does is never gated — help prints usage and exits.
  // (`vercel help <cmd>` reaches dispatch with `-h` pushed into argv too.)
  if (argv.includes('--help') || argv.includes('-h')) {
    return undefined;
  }

  switch (command) {
    case 'deploy':
      // A preview deploy is the mission's core loop and stays ungated.
      if (hasProductionFlag(argv)) {
        return { gate: 'production', description: 'deploys to production' };
      }
      return undefined;

    case 'promote':
      return {
        gate: 'production',
        description: 'promotes a deployment to production',
      };

    case 'rollback':
      return {
        gate: 'production',
        description: 'changes which deployment production serves',
      };

    case 'integration': {
      const sub = subcommandOf(command, argv);
      if (sub === 'add') {
        return {
          gate: 'spend',
          description: 'provisions a marketplace resource, which may be billed',
        };
      }
      if (sub === 'remove') {
        return {
          gate: 'remote-delete',
          description: 'uninstalls an integration from the account',
        };
      }
      return undefined;
    }

    case 'integration-resource': {
      const sub = subcommandOf(command, argv);
      if (sub === 'remove') {
        return {
          gate: 'remote-delete',
          description:
            'permanently deletes a provisioned resource and its data',
        };
      }
      return undefined;
    }

    case 'project': {
      const sub = subcommandOf(command, argv);
      if (sub === 'rm' || sub === 'remove') {
        return {
          gate: 'remote-delete',
          description: 'permanently deletes a Vercel project',
        };
      }
      return undefined;
    }

    case 'domains': {
      const sub = subcommandOf(command, argv);
      if (sub === 'buy') {
        return { gate: 'spend', description: 'purchases a domain' };
      }
      if (sub === 'rm' || sub === 'remove') {
        return {
          gate: 'remote-delete',
          description: 'removes a domain from the account',
        };
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

function hasProductionFlag(argv: string[]): boolean {
  if (argv.includes('--prod') || argv.includes('--target=production')) {
    return true;
  }
  const target = argv.indexOf('--target');
  return target !== -1 && argv[target + 1] === 'production';
}

/**
 * The token after the command token, skipping flags.
 *
 * Flag *values* (`--scope my-team`) are indistinguishable from positionals
 * without every command's flag spec, so the subcommand is anchored to the
 * command token itself, which must be present for the dispatcher to have
 * resolved this command at all.
 */
function subcommandOf(command: string, argv: string[]): string | undefined {
  const tokens = argv.filter(arg => !arg.startsWith('-'));
  const names = COMMAND_TOKENS[command] ?? [command];
  const at = tokens.findIndex(token => names.includes(token));
  return at === -1 ? undefined : tokens[at + 1];
}
