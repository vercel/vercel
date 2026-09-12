import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { kmsCommand } from '../../../../commands/kms/command';

export class KmsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof kmsCommand>
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

  trackCliSubcommandImport(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'import',
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

  trackCliSubcommandAddKey(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add-key',
      value: actual,
    });
  }

  trackCliSubcommandImportKey(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'import-key',
      value: actual,
    });
  }

  trackCliSubcommandActivateKey(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'activate-key',
      value: actual,
    });
  }

  trackCliSubcommandRevokeKey(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'revoke-key',
      value: actual,
    });
  }

  trackCliSubcommandAddGrant(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add-grant',
      value: actual,
    });
  }

  trackCliSubcommandUpdateGrant(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update-grant',
      value: actual,
    });
  }

  trackCliSubcommandRemoveGrant(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove-grant',
      value: actual,
    });
  }
}
