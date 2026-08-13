import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { accessGroupCommand } from '../../../../commands/access-group/command';

export class AccessGroupTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof accessGroupCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandMembers(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'members',
      value: actual,
    });
  }

  trackCliArgumentIdOrName(idOrName: string | undefined) {
    if (idOrName) {
      this.trackCliArgument({
        arg: 'idOrName',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
