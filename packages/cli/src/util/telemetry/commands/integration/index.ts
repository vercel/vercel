import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { integrationCommand } from '../../../../commands/integration/command';

export class IntegrationTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof integrationCommand>
{
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandAcceptTerms(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'accept-terms',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInstallations(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'installations',
      value: actual,
    });
  }

  trackCliSubcommandDiscover(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'discover',
      value: actual,
    });
  }

  trackCliSubcommandOpen(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'open',
      value: actual,
    });
  }

  trackCliSubcommandBalance(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'balance',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandGuide(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'guide',
      value: actual,
    });
  }
}
