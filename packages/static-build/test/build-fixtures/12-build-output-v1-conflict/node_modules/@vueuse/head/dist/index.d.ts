import * as vue from 'vue';
import { UnwrapRef, App, Ref } from 'vue';

declare type MaybeRef<T> = T | Ref<T>;
declare type HeadAttrs = {
    [k: string]: any;
};
declare type HeadObject = {
    title?: MaybeRef<string>;
    meta?: MaybeRef<HeadAttrs[]>;
    link?: MaybeRef<HeadAttrs[]>;
    base?: MaybeRef<HeadAttrs>;
    style?: MaybeRef<HeadAttrs[]>;
    script?: MaybeRef<HeadAttrs[]>;
    htmlAttrs?: MaybeRef<HeadAttrs>;
    bodyAttrs?: MaybeRef<HeadAttrs>;
};
declare type HeadObjectPlain = UnwrapRef<HeadObject>;
declare type HeadTag = {
    tag: string;
    props: {
        [k: string]: any;
    };
};
declare type HeadClient = {
    install: (app: App) => void;
    headTags: HeadTag[];
    addHeadObjs: (objs: Ref<HeadObjectPlain>) => void;
    removeHeadObjs: (objs: Ref<HeadObjectPlain>) => void;
    updateDOM: (document?: Document) => void;
};
interface HTMLResult {
    readonly headTags: string;
    readonly htmlAttrs: string;
    readonly bodyAttrs: string;
}
/**
 * Inject the head manager instance
 * Exported for advanced usage or library integration, you probably don't need this
 */
declare const injectHead: () => HeadClient;
declare const createHead: () => HeadClient;
declare const useHead: (obj: MaybeRef<HeadObject>) => void;
declare const renderHeadToString: (head: HeadClient) => HTMLResult;
declare const Head: vue.DefineComponent<{}, () => null, {}, {}, {}, vue.ComponentOptionsMixin, vue.ComponentOptionsMixin, vue.EmitsOptions, string, vue.VNodeProps & vue.AllowedComponentProps & vue.ComponentCustomProps, Readonly<vue.ExtractPropTypes<{}>>, {}>;

export { HTMLResult, Head, HeadAttrs, HeadClient, HeadObject, HeadObjectPlain, HeadTag, createHead, injectHead, renderHeadToString, useHead };
