import type { Router, RouteLocationNormalizedLoaded, NavigationGuard, RouteLocationNormalized, RouteLocationRaw, NavigationFailure } from 'vue-router';
export declare const useRouter: () => Router;
export declare const useRoute: () => RouteLocationNormalizedLoaded;
export declare const useActiveRoute: () => RouteLocationNormalizedLoaded;
export interface RouteMiddleware {
    (to: RouteLocationNormalized, from: RouteLocationNormalized): ReturnType<NavigationGuard>;
}
export declare const defineNuxtRouteMiddleware: (middleware: RouteMiddleware) => RouteMiddleware;
export interface AddRouteMiddlewareOptions {
    global?: boolean;
}
interface AddRouteMiddleware {
    (name: string, middleware: RouteMiddleware, options?: AddRouteMiddlewareOptions): void;
    (middleware: RouteMiddleware): void;
}
export declare const addRouteMiddleware: AddRouteMiddleware;
export interface NavigateToOptions {
    replace?: boolean;
    redirectCode?: number;
}
export declare const navigateTo: (to: RouteLocationRaw, options?: NavigateToOptions) => Promise<void | NavigationFailure> | RouteLocationRaw;
/** This will abort navigation within a Nuxt route middleware handler. */
export declare const abortNavigation: (err?: Error | string) => boolean;
export {};
