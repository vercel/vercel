import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/env/command';
import type { CustomEnvironmentType } from '@vercel-internals/types';

export class EnvAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  // Arguments
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliArgument({
        arg: 'environment',
        value: STANDARD_ENVIRONMENTS.includes(
          environment as CustomEnvironmentType
        )
          ? environment
          : this.redactedValue,
      });
    }
  }

  trackCliArgumentGitBranch(gitBranch: string | undefined) {
    if (gitBranch) {
      this.trackCliArgument({
        arg: 'git-branch',
        value: this.redactedValue,
      });
    }
  }

  // Options
  trackCliOptionTarget(targets: [string] | undefined) {
    if (targets && targets.length > 0) {
      // Track presence and redact custom envs
      this.trackCliOption({
        option: 'target',
        value: this.redactedTargetName(targets[0]),
      });
    }
  }

  trackCliOptionGitBranch(gitBranch: string | undefined) {
    if (gitBranch) {
      this.trackCliOption({
        option: 'git-branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionValue(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'value',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionValueFile(file: string | undefined) {
    if (file) {
      this.trackCliOption({
        option: 'value-file',
        value: this.redactedValue,
      });
    }
  }

  // Flags
  trackCliFlagSensitive(sensitive: boolean | undefined) {
    if (sensitive) {
      this.trackCliFlag('sensitive');
    }
  }

  trackCliFlagForce(force: boolean | undefined) {
    if (force) {
      this.trackCliFlag('force');
    }
  }

  trackCliFlagReplace(replace: boolean | undefined) {
    if (replace) {
      this.trackCliFlag('replace');
    }
  }

  trackCliFlagValueStdin(valueStdin: boolean | undefined) {
    if (valueStdin) {
      this.trackCliFlag('value-stdin');
    }
  }

  trackCliFlagGuidance(guidance: boolean | undefined) {
    if (guidance) {
      this.trackCliFlag('guidance');
    }
  }
}
