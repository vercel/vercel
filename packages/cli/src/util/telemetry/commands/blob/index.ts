import type { blobCommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';
import { BlobAuthTelemetryClient } from './auth';
export { BlobPresignTelemetryClient } from './presign';
export { BlobSignedTokenTelemetryClient } from './signed-token';

export class BlobTelemetryClient
  extends BlobAuthTelemetryClient
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

  trackCliSubcommandSignedToken(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'signed-token',
      value: actual,
    });
  }

  trackCliSubcommandPresign(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'presign',
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
}
