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

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
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

  /**
   * `project protection trusted-ips` action (get/set/disable). Verbatim: these
   * are a closed, non-sensitive set.
   */
  trackCliArgumentAction(action: string | undefined) {
    this.trackCliArgument({
      arg: 'action',
      value: action,
    });
  }

  /**
   * `--deployment-type` deployment target. Value is an allowlisted enum, so it
   * is safe to record verbatim; anything unexpected is redacted.
   */
  trackCliOptionDeploymentType(value: string | undefined) {
    if (!value) return;
    const allowed = [
      'all',
      'preview',
      'production',
      'prod_deployment_urls_and_all_previews',
      'all_except_custom_domains',
    ];
    this.trackCliOption({
      option: 'deployment-type',
      value: allowed.includes(value) ? value : this.redactedValue,
    });
  }

  /**
   * `--mode` protection mode. Allowlisted enum recorded verbatim; anything
   * unexpected is redacted.
   */
  trackCliOptionMode(value: string | undefined) {
    if (!value) return;
    const allowed = ['additional', 'exclusive'];
    this.trackCliOption({
      option: 'mode',
      value: allowed.includes(value) ? value : this.redactedValue,
    });
  }

  /**
   * `--ip` allowlist entries. IP addresses and their notes are sensitive infra
   * data, so only the redacted presence is recorded.
   */
  trackCliOptionIp(values: string[] | undefined) {
    if (!values || values.length === 0) return;
    this.trackCliOption({
      option: 'ip',
      value: this.redactedValue,
    });
  }

  trackCliFlagYes(present: boolean | undefined) {
    if (present) {
      this.trackCliFlag('yes');
    }
  }

  /**
   * `--path` allowlist entries. Paths are sensitive infra data, so only the
   * redacted presence is recorded.
   */
  trackCliOptionPath(values: string[] | undefined) {
    if (!values || values.length === 0) return;
    this.trackCliOption({
      option: 'path',
      value: this.redactedValue,
    });
  }

  /**
   * `--file` config file path. File paths and contents are never recorded;
   * only the redacted presence is tracked.
   */
  trackCliOptionFile(value: string | undefined) {
    if (!value) return;
    this.trackCliOption({
      option: 'file',
      value: this.redactedValue,
    });
  }
}
