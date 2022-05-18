
import { ModuleOptions } from './module'

declare module '@nuxt/schema' {
  interface NuxtConfig { ['telemetry']?: Partial<ModuleOptions> }
  interface NuxtOptions { ['telemetry']?: ModuleOptions }
}


export { default } from './module'
