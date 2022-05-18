/// <reference path="types/augments.d.ts" />
export * from './nuxt';
export * from './composables';
export * from './components';
export type { PageMeta } from '../pages/runtime';
export type { MetaObject } from '../head/runtime';
export { useHead, useMeta } from '#head';
export declare const isVue2 = false;
export declare const isVue3 = true;
