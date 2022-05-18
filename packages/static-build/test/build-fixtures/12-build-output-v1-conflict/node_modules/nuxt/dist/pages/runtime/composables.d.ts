import { KeepAliveProps, TransitionProps, UnwrapRef } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
export interface PageMeta {
    [key: string]: any;
    pageTransition?: boolean | TransitionProps;
    layoutTransition?: boolean | TransitionProps;
    key?: false | string | ((route: RouteLocationNormalizedLoaded) => string);
    keepalive?: boolean | KeepAliveProps;
}
declare module 'vue-router' {
    interface RouteMeta extends UnwrapRef<PageMeta> {
    }
}
export declare const definePageMeta: (meta: PageMeta) => void;
