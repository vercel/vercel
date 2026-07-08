import type { TelemetryMethods } from '../../types';
import type { issuesSubcommand } from '../../../../commands/agent-runs/command';
import { AgentRunsQueryTelemetryClient } from './shared';

export class AgentIssuesTelemetryClient
  extends AgentRunsQueryTelemetryClient
  implements TelemetryMethods<typeof issuesSubcommand> {}
