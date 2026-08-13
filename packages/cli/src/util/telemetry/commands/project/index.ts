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

  /** Project name/id argument for `members add`/`members remove` (redacted). */
  trackCliArgumentProject(project: string | undefined) {
    if (project) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  /** Member identifier (email/username/uid) for `members add`/`remove` (redacted). */
  trackCliArgumentMember(member: string | undefined) {
    if (member) {
      this.trackCliArgument({
        arg: 'member',
        value: this.redactedValue,
      });
    }
  }

  /** Records the `--role` value verbatim when it is a known enum, else redacts. */
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

  /** `--yes` confirmation-skip flag for `members remove`. */
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
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
}
