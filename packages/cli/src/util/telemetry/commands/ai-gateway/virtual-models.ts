import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { virtualModelsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayVirtualModelsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof virtualModelsSubcommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }

  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({ subcommand: 'delete', value: actual });
  }

  trackCliSubcommandRestore(actual: string) {
    this.trackCliSubcommand({ subcommand: 'restore', value: actual });
  }
}
