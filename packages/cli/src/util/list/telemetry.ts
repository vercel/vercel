import { TelemetryClient } from '../telemetry';

const SystemEnvironments = ['production', 'preview', 'development'];
const CustomEnvironmentPlaceholder = 'CUSTOM';

export class ListTelemetryClient extends TelemetryClient {
  trackArgumentApp(app: string | undefined) {
    this.trackCliArgument('app', app);
  }

  trackFlagConfirm(passed: boolean | undefined) {
    this.trackCliFlag('confirm', passed);
  }

  trackFlagYes(passed: boolean | undefined) {
    this.trackCliFlag('yes', passed);
  }

  trackOptionMeta(value: { [k: string]: string }) {
    if (value) {
      this.trackCliOption('meta', 'KEY=VALUE');
    }
  }

  trackFlagPolicy(value: { [k: string]: string }) {
    if (value) {
      this.trackCliOption('policy', 'KEY=VALUE');
    }
  }

  trackOptionNext(ms: number | undefined) {
    this.trackCliOption('next', String(ms));
  }

  trackOptionEnvironment(environment: string) {
    if (SystemEnvironments.includes(environment)) {
      this.trackCliOption('next', environment);
    } else {
      this.trackCliOption('next', CustomEnvironmentPlaceholder);
    }
  }

  trackFlagProd(passed: true | undefined) {
    this.trackCliFlag('prod', passed);
  }
}
