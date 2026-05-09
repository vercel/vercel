import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connexCommand } from '../../../../commands/connex/command';

export class ConnexTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connexCommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandToken(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'token',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandOpen(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'open',
      value: actual,
    });
  }

  trackCliSubcommandLink(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'link',
      value: actual,
    });
  }

  trackCliArgumentClient(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'client',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagDisconnectAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('disconnect-all');
    }
  }

  trackCliFlagAllProjects(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all-projects');
    }
  }

  trackCliOptionLimit(v: number | undefined) {
    if (v !== undefined) {
      this.trackCliOption({
        option: 'limit',
        value: String(v),
      });
    }
  }

  trackCliOptionNext(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'format',
        value: v,
      });
    }
  }

  trackCliOptionEnvironment(v: string[] | undefined) {
    if (!v || v.length === 0) {
      return;
    }
    for (const raw of v) {
      for (const env of raw.split(',')) {
        const trimmed = env.trim();
        if (!trimmed) {
          continue;
        }
        this.trackCliOption({
          option: 'environment',
          value: this.redactedTargetName(trimmed),
        });
      }
    }
  }

  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }
}
