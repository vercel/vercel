import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { projectCommand } from '../../../../commands/project/command';

export class ProjectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof projectCommand>
{
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandAccessSummary(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'access-summary',
      value: actual,
    });
  }

  trackCliSubcommandChecks(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'checks',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandRename(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rename',
      value: actual,
    });
  }

  trackCliSubcommandToken(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'token',
      value: actual,
    });
  }

  trackCliSubcommandMembers(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'members',
      value: actual,
    });
  }

  trackCliSubcommandAccessGroups(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'access-groups',
      value: actual,
    });
  }

  trackCliSubcommandProtection(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'protection',
      value: actual,
    });
  }

  trackCliSubcommandWebAnalytics(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'web-analytics',
      value: actual,
    });
  }

  trackCliSubcommandSpeedInsights(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'speed-insights',
      value: actual,
    });
  }
}
