import type { App, onErrorCaptured, VNode } from 'vue';
import { Hookable } from 'hookable';
import type { RuntimeConfig } from '@nuxt/schema';
import { LegacyContext } from './compat/legacy-app';
declare type NuxtMeta = {
    htmlAttrs?: string;
    headAttrs?: string;
    bodyAttrs?: string;
    headTags?: string;
    bodyScriptsPrepend?: string;
    bodyScripts?: string;
};
declare type HookResult = Promise<void> | void;
export interface RuntimeNuxtHooks {
    'app:created': (app: App<Element>) => HookResult;
    'app:beforeMount': (app: App<Element>) => HookResult;
    'app:mounted': (app: App<Element>) => HookResult;
    'app:rendered': () => HookResult;
    'app:redirected': () => HookResult;
    'app:suspense:resolve': (Component?: VNode) => HookResult;
    'app:error': (err: any) => HookResult;
    'app:error:cleared': (options: {
        redirect?: string;
    }) => HookResult;
    'app:data:refresh': (keys?: string[]) => HookResult;
    'page:start': (Component?: VNode) => HookResult;
    'page:finish': (Component?: VNode) => HookResult;
    'meta:register': (metaRenderers: Array<(nuxt: NuxtApp) => NuxtMeta | Promise<NuxtMeta>>) => HookResult;
    'vue:setup': () => void;
    'vue:error': (...args: Parameters<Parameters<typeof onErrorCaptured>[0]>) => HookResult;
}
interface _NuxtApp {
    vueApp: App<Element>;
    globalName: string;
    hooks: Hookable<RuntimeNuxtHooks>;
    hook: _NuxtApp['hooks']['hook'];
    callHook: _NuxtApp['hooks']['callHook'];
    [key: string]: any;
    _asyncDataPromises?: Record<string, Promise<any>>;
    _legacyContext?: LegacyContext;
    ssrContext?: Record<string, any> & {
        renderMeta?: () => Promise<NuxtMeta> | NuxtMeta;
    };
    payload: {
        serverRendered?: true;
        data?: Record<string, any>;
        state?: Record<string, any>;
        rendered?: Function;
        [key: string]: any;
    };
    provide: (name: string, value: any) => void;
}
export interface NuxtApp extends _NuxtApp {
}
export declare const NuxtPluginIndicator = "__nuxt_plugin";
export interface Plugin<Injections extends Record<string, any> = Record<string, any>> {
    (nuxt: _NuxtApp): Promise<void> | Promise<{
        provide?: Injections;
    }> | void | {
        provide?: Injections;
    };
    [NuxtPluginIndicator]?: true;
}
export interface LegacyPlugin {
    (context: LegacyContext, provide: NuxtApp['provide']): Promise<void> | void;
}
export interface CreateOptions {
    vueApp: NuxtApp['vueApp'];
    ssrContext?: NuxtApp['ssrContext'];
    globalName?: NuxtApp['globalName'];
}
export declare function createNuxtApp(options: CreateOptions): NuxtApp;
export declare function applyPlugin(nuxtApp: NuxtApp, plugin: Plugin): Promise<void>;
export declare function applyPlugins(nuxtApp: NuxtApp, plugins: Plugin[]): Promise<void>;
export declare function normalizePlugins(_plugins: Array<Plugin | LegacyPlugin>): Plugin<Record<string, any>>[];
export declare function defineNuxtPlugin<T>(plugin: Plugin<T>): Plugin<T>;
export declare function isLegacyPlugin(plugin: unknown): plugin is LegacyPlugin;
/**
 * Ensures that the setup function passed in has access to the Nuxt instance via `useNuxt`.
 *
 * @param nuxt A Nuxt instance
 * @param setup The function to call
 */
export declare function callWithNuxt<T extends (...args: any[]) => any>(nuxt: NuxtApp | _NuxtApp, setup: T, args?: Parameters<T>): any;
/**
 * Returns the current Nuxt instance.
 */
export declare function useNuxtApp(): NuxtApp;
export declare function useRuntimeConfig(): RuntimeConfig;
export {};
