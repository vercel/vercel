import type { TelemetryMethods } from '../../types';
import type { projectsSubcommand } from '../../../../commands/agent/command';
import { AgentRunsQueryTelemetryClient } from './shared';

export class AgentProjectsTelemetryClient
  extends AgentRunsQueryTelemetryClient
  implements TelemetryMethods<typeof projectsSubcommand> {}
