import { NuxtOptions, Nuxt, NuxtConfig } from '@nuxt/schema';
export { NuxtConfig } from '@nuxt/schema';
import { LoadNuxtOptions } from '@nuxt/kit';

declare function createNuxt(options: NuxtOptions): Nuxt;
declare function loadNuxt(opts: LoadNuxtOptions): Promise<Nuxt>;
declare function defineNuxtConfig(config: NuxtConfig): NuxtConfig;

declare function build(nuxt: Nuxt): Promise<void>;

export { build, createNuxt, defineNuxtConfig, loadNuxt };
