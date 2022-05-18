import NuxtPage from './page';
declare module 'vue' {
    interface GlobalComponents {
        NuxtPage: typeof NuxtPage;
        /** @deprecated */
        NuxtNestedPage: typeof NuxtPage;
        /** @deprecated */
        NuxtChild: typeof NuxtPage;
    }
}
declare const _default: any;
export default _default;
