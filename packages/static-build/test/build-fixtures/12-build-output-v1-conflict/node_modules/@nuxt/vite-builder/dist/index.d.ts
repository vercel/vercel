import * as vite from 'vite';
import { InlineConfig, SSROptions } from 'vite';
import { Nuxt } from '@nuxt/schema';
import { Options } from '@vitejs/plugin-vue';

interface ViteOptions extends InlineConfig {
    vue?: Options;
    ssr?: SSROptions;
}
interface ViteBuildContext {
    nuxt: Nuxt;
    config: ViteOptions;
    clientServer?: vite.ViteDevServer;
    ssrServer?: vite.ViteDevServer;
}
declare function bundle(nuxt: Nuxt): Promise<void>;

export { ViteBuildContext, ViteOptions, bundle };
