import type { ComputedGetter } from '@vue/reactivity';
import type { MetaObject } from '@nuxt/schema';
/**
 * You can pass in a meta object, which has keys corresponding to meta tags:
 * `title`, `base`, `script`, `style`, `meta` and `link`, as well as `htmlAttrs` and `bodyAttrs`.
 *
 * Alternatively, for reactive meta state, you can pass in a function
 * that returns a meta object.
 */
export declare function useHead(meta: MetaObject | ComputedGetter<MetaObject>): void;
/** @deprecated Please use new `useHead` composable instead */
export declare function useMeta(meta: MetaObject | ComputedGetter<MetaObject>): void;
