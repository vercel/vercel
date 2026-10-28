import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { globalConfigCommand } from '../../../../commands/global-config/command';

export class GlobalConfigTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof globalConfigCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
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

  trackCliSubcommandItems(actual: string) {
    this.trackCliSubcommand({ subcommand: 'items', value: actual });
  }

  trackCliSubcommandTokens(actual: string) {
    this.trackCliSubcommand({ subcommand: 'tokens', value: actual });
  }

  trackCliSubcommandBackups(actual: string) {
    this.trackCliSubcommand({ subcommand: 'backups', value: actual });
  }
}
