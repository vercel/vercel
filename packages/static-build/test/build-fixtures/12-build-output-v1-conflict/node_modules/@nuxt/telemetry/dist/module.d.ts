import * as _nuxt_schema from '@nuxt/schema';

interface TelemetryOptions {
  debug: boolean
  endpoint: string
  seed: string
  consent?: number
  enabled: boolean
}

declare type ModuleOptions = boolean | TelemetryOptions;
declare const _default: _nuxt_schema.NuxtModule<TelemetryOptions>;

export { ModuleOptions, _default as default };
