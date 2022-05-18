interface Route {
    /** Percentage encoded pathname section of the URL. */
    path: string;
    /** The whole location including the `search` and `hash`. */
    fullPath: string;
    /** Object representation of the `search` property of the current location. */
    query: Record<string, any>;
    /** Hash of the current location. If present, starts with a `#`. */
    hash: string;
    /** Name of the matched record */
    name: string | null | undefined;
    /** Object of decoded params extracted from the `path`. */
    params: Record<string, any>;
    /**
     * The location we were initially trying to access before ending up
     * on the current location.
     */
    redirectedFrom: Route | undefined;
    /** Merged `meta` properties from all of the matched route records. */
    meta: Record<string, any>;
}
declare type RouteGuardReturn = void | Error | string | false;
interface RouterHooks {
    'resolve:before': (to: Route, from: Route) => RouteGuardReturn | Promise<RouteGuardReturn>;
    'navigate:before': (to: Route, from: Route) => RouteGuardReturn | Promise<RouteGuardReturn>;
    'navigate:after': (to: Route, from: Route) => void | Promise<void>;
    'error': (err: any) => void | Promise<void>;
}
interface Router {
    currentRoute: Route;
    isReady: () => Promise<void>;
    options: {};
    install: () => Promise<void>;
    push: (url: string) => Promise<void>;
    replace: (url: string) => Promise<void>;
    back: () => void;
    go: (delta: number) => void;
    forward: () => void;
    beforeResolve: (guard: RouterHooks['resolve:before']) => () => void;
    beforeEach: (guard: RouterHooks['navigate:before']) => () => void;
    afterEach: (guard: RouterHooks['navigate:after']) => () => void;
    onError: (handler: RouterHooks['error']) => () => void;
    resolve: (url: string | Record<string, unknown>) => Route;
    addRoute: (parentName: string, route: Route) => void;
    getRoutes: () => any[];
    hasRoute: (name: string) => boolean;
    removeRoute: (name: string) => void;
}
declare const _default: import("..").Plugin<{
    route: Route;
    router: Router;
}>;
export default _default;
