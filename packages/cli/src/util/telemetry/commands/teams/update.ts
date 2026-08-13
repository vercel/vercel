import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/teams/command';

const TOOLBAR_VALUES = ['on', 'off', 'default'];
const BUILD_MACHINE_VALUES = [
  'basic',
  'standard',
  'enhanced',
  'turbo',
  'elastic',
];

export class TeamsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentTeamSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({
        arg: 'team-slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name !== undefined) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSlug(slug: string | undefined) {
    if (slug !== undefined) {
      this.trackCliOption({
        option: 'slug',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPreviewSuffix(suffix: string | undefined) {
    if (suffix !== undefined) {
      this.trackCliOption({
        option: 'preview-suffix',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionToolbar(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'toolbar',
        value: TOOLBAR_VALUES.includes(value) ? value : this.redactedValue,
      });
    }
  }

  trackCliOptionDefaultBuildMachine(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'default-build-machine',
        value: BUILD_MACHINE_VALUES.includes(value)
          ? value
          : this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
