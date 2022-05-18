/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from 'vue';
import type { Component } from '@vue/runtime-core';
import type { RouteLocationNormalized, Router } from 'vue-router';
import { NuxtApp } from '../nuxt';
declare type Store = any;
export declare type LegacyApp = App<Element> & {
    $root: LegacyApp;
    constructor: LegacyApp;
    $router?: Router;
};
export interface LegacyContext {
    $config: Record<string, any>;
    env: Record<string, any>;
    app: Component;
    isClient: boolean;
    isServer: boolean;
    isStatic: boolean;
    isDev: boolean;
    isHMR: boolean;
    store: Store;
    route: RouteLocationNormalized;
    params: RouteLocationNormalized['params'];
    query: RouteLocationNormalized['query'];
    base: string; /** TODO: */
    payload: any; /** TODO: */
    from: RouteLocationNormalized; /** TODO: */
    nuxtState: Record<string, any>;
    beforeNuxtRender(fn: (params: {
        Components: any;
        nuxtState: Record<string, any>;
    }) => void): void;
    beforeSerialize(fn: (nuxtState: Record<string, any>) => void): void;
    enablePreview?: (previewData?: Record<string, any>) => void;
    $preview?: Record<string, any>;
    req: IncomingMessage;
    res: ServerResponse;
    /** TODO: */
    next?: (err?: any) => any;
    error(params: any): void;
    redirect(status: number, path: string, query?: RouteLocationNormalized['query']): void;
    redirect(path: string, query?: RouteLocationNormalized['query']): void;
    redirect(location: Location): void;
    redirect(status: number, location: Location): void;
    ssrContext?: {
        req: LegacyContext['req'];
        res: LegacyContext['res'];
        url: string;
        runtimeConfig: {
            public: Record<string, any>;
            private: Record<string, any>;
        };
        target: string;
        spa?: boolean;
        modern: boolean;
        fetchCounters: Record<string, number>;
        next: LegacyContext['next'];
        redirected: boolean;
        beforeRenderFns: Array<() => any>;
        beforeSerializeFns: Array<() => any>;
        nuxt: {
            serverRendered: boolean;
            layout: string;
            data: Array<Record<string, any>>;
            fetch: Array<Record<string, any>>;
            error: any;
            state: Array<Record<string, any>>;
            routePath: string;
            config: Record<string, any>;
        };
    };
}
export declare const legacyPlugin: (nuxtApp: NuxtApp) => void;
export {};
