import { RouterView, RouteLocationNormalizedLoaded } from 'vue-router';
declare type InstanceOf<T> = T extends new (...args: any[]) => infer R ? R : never;
export declare type RouterViewSlotProps = Parameters<InstanceOf<typeof RouterView>['$slots']['default']>[0];
export declare const generateRouteKey: (override: string | ((route: RouteLocationNormalizedLoaded) => string), routeProps: RouterViewSlotProps) => string | false;
export declare const wrapInKeepAlive: (props: any, children: any) => {
    default: () => any;
};
export {};
