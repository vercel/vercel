import type { schedulesCommand } from '../../../../commands/schedules/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class SchedulesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof schedulesCommand>
{
  trackCliFlagLocal(local: boolean | undefined) {
    if (local) this.trackCliFlag('local');
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }

  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({ subcommand: 'enable', value: actual });
  }

  trackCliSubcommandDisable(actual: string) {
    this.trackCliSubcommand({ subcommand: 'disable', value: actual });
  }

  trackCliSubcommandInvoke(actual: string) {
    this.trackCliSubcommand({ subcommand: 'invoke', value: actual });
  }

  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({ subcommand: 'delete', value: actual });
  }

  trackCliSubcommandExecutions(actual: string) {
    this.trackCliSubcommand({ subcommand: 'executions', value: actual });
  }

  trackCliSubcommandExecutionsList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'executions:list',
      value: actual,
    });
  }
}
