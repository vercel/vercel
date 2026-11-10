import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { monitorsCommand } from '../../../../commands/monitors/command';

export class MonitorsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof monitorsCommand>
{
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({ subcommand: 'ls', value: actual });
  }

  trackCliSubcommandSchema(actual: string) {
    this.trackCliSubcommand({ subcommand: 'schema', value: actual });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({ subcommand: 'add', value: actual });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }

  trackCliSubcommandNotifications(actual: string) {
    this.trackCliSubcommand({ subcommand: 'notifications', value: actual });
  }

  trackCliOptionType(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({ option: 'type', value: v.join(',') });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
