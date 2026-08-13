import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/target/command';

const BRANCH_MATCHER_TYPES = ['equals', 'startsWith', 'endsWith'];

export class TargetAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDescription(description: string | undefined) {
    if (description) {
      this.trackCliOption({
        option: 'description',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBranchMatcherType(type: string | undefined) {
    if (type) {
      this.trackCliOption({
        option: 'branch-matcher-type',
        value: BRANCH_MATCHER_TYPES.includes(type) ? type : this.redactedValue,
      });
    }
  }

  trackCliOptionBranchMatcherPattern(pattern: string | undefined) {
    if (pattern) {
      this.trackCliOption({
        option: 'branch-matcher-pattern',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCopyEnvVarsFrom(env: string | undefined) {
    if (env) {
      this.trackCliOption({
        option: 'copy-env-vars-from',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
