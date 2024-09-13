import { TelemetryClient } from '../telemetry';

const SystemEnvironments = ['production', 'preview', 'development'];
const CustomEnvironmentPlaceholder = 'CUSTOM';

export class ListTelemetryClient extends TelemetryClient {
  trackArgumentApp(app: string | undefined) {
    this.trackCliArgument('app', app);
  }

  trackFlagConfirm(passed: boolean | undefined) {
    this.trackCliBooleanFlag('confirm', passed);
  }

  trackFlagYes(passed: boolean | undefined) {
    this.trackCliBooleanFlag('yes', passed);
  }

  trackFlagMeta(value: { [k: string]: string }) {
    if (value) {
      this.trackCliFlag('meta', 'KEY=VALUE');
    }
  }

  trackFlagPolicy(value: { [k: string]: string }) {
    if (value) {
      this.trackCliFlag('policy', 'KEY=VALUE');
    }
  }

  trackFlagNext(ms: number | undefined) {
    this.trackCliFlag('next', String(ms));
  }

  trackFlagEnvironment(environment: string) {
    if (SystemEnvironments.includes(environment)) {
      this.trackCliFlag('next', environment);
    } else {
      this.trackCliFlag('next', CustomEnvironmentPlaceholder);
    }
  }

  trackFlagProd(passed: true | undefined) {
    this.trackCliBooleanFlag('prod', passed);
  }
}
