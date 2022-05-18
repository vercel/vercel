import { DefineComponent } from 'vue';
import { RouteLocationRaw } from 'vue-router';
export declare type NuxtLinkOptions = {
    componentName?: string;
    externalRelAttribute?: string | null;
    activeClass?: string;
    exactActiveClass?: string;
};
export declare type NuxtLinkProps = {
    to?: string | RouteLocationRaw;
    href?: string | RouteLocationRaw;
    external?: boolean;
    target?: string;
    rel?: string;
    noRel?: boolean;
    activeClass?: string;
    exactActiveClass?: string;
    replace?: boolean;
    ariaCurrentValue?: string;
};
export declare function defineNuxtLink(options: NuxtLinkOptions): DefineComponent<NuxtLinkProps, {}, {}, import("vue").ComputedOptions, import("vue").MethodOptions, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps, Readonly<NuxtLinkProps>, {}>;
declare const _default: DefineComponent<NuxtLinkProps, {}, {}, import("vue").ComputedOptions, import("vue").MethodOptions, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps, Readonly<NuxtLinkProps>, {}>;
export default _default;
