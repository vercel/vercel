import { TelemetryClient } from '../..';
import type { blobCommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof blobCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandPut(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'put',
      value: actual,
    });
  }

  trackCliSubcommandDel(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'del',
      value: actual,
    });
  }

  trackCliSubcommandCopy(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'copy',
      value: actual,
    });
  }

  trackCliSubcommandStore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'store',
      value: actual,
    });
  }

  trackCliOptionRwToken() {
    this.trackCliOption({
      option: '--rw-token',
      value: this.redactedValue,
    });
  }
}
