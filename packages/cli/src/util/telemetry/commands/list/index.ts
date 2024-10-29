import { TelemetryClient } from '../..';

export class ListTelemetryClient extends TelemetryClient {
  trackCliOptionMeta(meta?: string[]) {
    if (meta && meta.length > 0) {
      this.trackCliOption({
        option: 'meta',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPolicy(policy?: string[]) {
    if (policy && policy.length > 0) {
      this.trackCliOption({
        option: 'policy',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment?: string) {
    if (environment) {
      const redactUnknownEnvironment = (environment: string) => {
        if (environment !== 'production' && environment !== 'preview') {
          return this.redactedValue;
        }
        return environment;
      };
      this.trackCliOption({
        option: 'environment',
        value: redactUnknownEnvironment(environment),
      });
    }
  }

  trackCliOptionNext(next?: number) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagProd(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagConfirm(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliArgumentApp(app?: string) {
    if (app) {
      this.trackCliArgument({
        arg: 'app',
        value: this.redactedValue,
      });
    }
  }
}
