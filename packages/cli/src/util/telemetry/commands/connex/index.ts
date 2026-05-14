import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connexCommand } from '../../../../commands/connex/command';
import { isValidHexColor } from '../../../connex/validate-hex';

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

  trackCliSubcommandAttach(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'attach',
      value: actual,
    });
  }

  trackCliSubcommandDetach(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'detach',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
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

  trackCliArgumentId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIcon(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'icon',
        // Path can leak username/repo location — redact.
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBackgroundColor(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'background-color',
        // Hex colors are not sensitive.
        value: v,
      });
    }
  }

  trackCliOptionAccentColor(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'accent-color',
        value: v,
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

  trackCliFlagTriggers(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('triggers');
    }
  }

  trackCliOptionTriggerBranch(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'trigger-branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTriggerPath(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'trigger-path',
        value: this.redactedValue,
      });
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
