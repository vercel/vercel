import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { microfrontendsCommand } from '../../../../commands/microfrontends/command';

export class MicrofrontendsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof microfrontendsCommand>
{
  trackCliSubcommandPull(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pull',
      value: actual,
    });
  }

  trackCliSubcommandCreateGroup(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create-group',
      value: actual,
    });
  }

  trackCliSubcommandAddToGroup(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add-to-group',
      value: actual,
    });
  }

  trackCliSubcommandRemoveFromGroup(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove-from-group',
      value: actual,
    });
  }

  trackCliSubcommandDeleteGroup(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'delete-group',
      value: actual,
    });
  }
}
