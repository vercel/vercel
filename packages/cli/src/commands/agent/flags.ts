import type { parseArguments } from '../../util/get-args';
import type { getFlagsSpecification } from '../../util/get-flags-specification';
import type { agentCommand } from './command';

/** Parsed `vercel agent` flags, including the global ones. */
export type AgentFlags = ReturnType<
  typeof parseArguments<
    ReturnType<typeof getFlagsSpecification<typeof agentCommand.options>>
  >
>['flags'];
