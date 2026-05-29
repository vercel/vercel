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

  trackCliSubcommandGet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'get',
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

  trackCliSubcommandCreateStore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create-store',
      value: actual,
    });
  }

  trackCliSubcommandDeleteStore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'delete-store',
      value: actual,
    });
  }

  trackCliSubcommandGetStore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'get-store',
      value: actual,
    });
  }

  trackCliSubcommandListStores(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list-stores',
      value: actual,
    });
  }

  trackCliSubcommandEmptyStore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'empty-store',
      value: actual,
    });
  }

  trackCliOptionRwToken(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: '--rw-token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOidcToken(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: '--oidc-token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionStoreId(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: '--store-id',
        value: this.redactedValue,
      });
    }
  }
}
