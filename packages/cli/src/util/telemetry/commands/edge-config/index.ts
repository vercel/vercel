import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { edgeConfigCommand } from '../../../../commands/edge-config/command';

export class EdgeConfigTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof edgeConfigCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({ subcommand: 'add', value: actual });
  }

  trackCliSubcommandGet(actual: string) {
    this.trackCliSubcommand({ subcommand: 'get', value: actual });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }

  trackCliSubcommandItems(actual: string) {
    this.trackCliSubcommand({ subcommand: 'items', value: actual });
  }

  trackCliSubcommandTokens(actual: string) {
    this.trackCliSubcommand({ subcommand: 'tokens', value: actual });
  }
}
