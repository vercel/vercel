import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { deployCommand } from '../../../../commands/deploy/command';
import { deprecatedArchiveSplitTgz } from '../../../../commands/deploy/command';
import { VALID_ARCHIVE_FORMATS } from '@vercel/client';

export class DeployTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof deployCommand>
{
  trackCliArgumentProjectPath(projectPaths: string | undefined) {
    if (projectPaths) {
      this.trackCliArgument({
        arg: 'project-path',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionArchive(format: string | undefined) {
    if (format) {
      const allowedFormat = [
        ...VALID_ARCHIVE_FORMATS,
        deprecatedArchiveSplitTgz,
      ].includes(format)
        ? format
        : this.redactedValue;
      this.trackCliOption({
        option: 'archive',
        value: allowedFormat,
      });
    }
  }
  trackCliOptionBuildEnv(buildEnv: string[] | undefined) {
    if (buildEnv && buildEnv.length > 0) {
      this.trackCliOption({
        option: 'build-env',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionEnv(env: string[] | undefined) {
    if (env && env.length > 0) {
      this.trackCliOption({
        option: 'env',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionMeta(meta: string[] | undefined) {
    if (meta && meta.length > 0) {
      this.trackCliOption({
        option: 'meta',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionRegions(regions: string | undefined) {
    if (regions) {
      this.trackCliOption({
        option: 'regions',
        // consider revisiting once we come up with a way to query the list of regions
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionTarget(target: string | undefined) {
    if (target) {
      this.trackCliOption({
        option: 'target',
        value: this.redactedTargetName(target),
      });
    }
  }
  trackCliFlagConfirm(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('confirm');
    }
  }
  trackCliFlagForce(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('force');
    }
  }
  trackCliFlagLogs(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('logs');
    }
  }
  trackCliFlagNoLogs(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('no-logs');
    }
  }
  trackCliFlagNoClipboard(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('no-clipboard');
    }
  }
  trackCliFlagNoWait(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('no-wait');
    }
  }
  trackCliFlagPrebuilt(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('prebuilt');
    }
  }
  trackCliFlagProd(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }
  trackCliFlagPublic(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('public');
    }
  }
  trackCliFlagSkipDomain(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('skip-domain');
    }
  }
  trackCliFlagWithCache(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('with-cache');
    }
  }
  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
