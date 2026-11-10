import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import {
  PROJECT_MEMBER_ROLES,
  type projectCommand,
} from '../../../../commands/project/command';

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

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
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

  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'delete',
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

  trackCliArgumentProject(project: string | undefined) {
    if (project) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentMember(member: string | undefined) {
    if (member) {
      this.trackCliArgument({
        arg: 'member',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRole(role: string | undefined) {
    if (role) {
      this.trackCliOption({
        option: 'role',
        value: (PROJECT_MEMBER_ROLES as readonly string[]).includes(role)
          ? role
          : this.redactedValue,
      });
    }
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

  trackCliSubcommandPause(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pause',
      value: actual,
    });
  }

  trackCliSubcommandDangerouslyDeleteImmutableStaticAsset(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'dangerously-delete-immutable-static-asset',
      value: actual,
    });
  }

  trackCliSubcommandObservability(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'observability',
      value: actual,
    });
  }

  trackCliSubcommandPriority(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'priority',
      value: actual,
    });
  }

  trackCliSubcommandResume(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'resume',
      value: actual,
    });
  }
}
