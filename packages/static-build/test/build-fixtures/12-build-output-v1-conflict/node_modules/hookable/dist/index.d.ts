declare type HookCallback = (...args: any) => Promise<void> | void;
interface Hooks {
    [key: string]: HookCallback;
}
declare type HookKeys<T> = keyof T & string;
declare type DeprecatedHook<T> = string | {
    message?: string;
    to: HookKeys<T>;
};
declare type DeprecatedHooks<T> = {
    [name in HookKeys<T>]: DeprecatedHook<T>;
};
declare type ValueOf<C> = C extends Record<any, any> ? C[keyof C] : never;
declare type Strings<T> = Exclude<keyof T, number | symbol>;
declare type KnownKeys<T> = keyof {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: never;
};
declare type StripGeneric<T> = Pick<T, KnownKeys<T> extends keyof T ? KnownKeys<T> : never>;
declare type OnlyGeneric<T> = Omit<T, KnownKeys<T> extends keyof T ? KnownKeys<T> : never>;
declare type Namespaces<T> = ValueOf<{
    [key in Strings<T>]: key extends `${infer Namespace}:${string}` ? Namespace : never;
}>;
declare type BareHooks<T> = ValueOf<{
    [key in Strings<T>]: key extends `${string}:${string}` ? never : key;
}>;
declare type HooksInNamespace<T, Namespace extends string> = ValueOf<{
    [key in Strings<T>]: key extends `${Namespace}:${infer HookName}` ? HookName : never;
}>;
declare type WithoutNamespace<T, Namespace extends string> = {
    [key in HooksInNamespace<T, Namespace>]: `${Namespace}:${key}` extends keyof T ? T[`${Namespace}:${key}`] : never;
};
declare type NestedHooks<T> = (Partial<StripGeneric<T>> | Partial<OnlyGeneric<T>>) & Partial<{
    [key in Namespaces<StripGeneric<T>>]: NestedHooks<WithoutNamespace<T, key>>;
}> & Partial<{
    [key in BareHooks<StripGeneric<T>>]: T[key];
}>;

declare type InferCallback<HT, HN extends keyof HT> = HT[HN] extends HookCallback ? HT[HN] : never;
declare class Hookable<HooksT = Record<string, HookCallback>, HookNameT extends HookKeys<HooksT> = HookKeys<HooksT>> {
    private _hooks;
    private _deprecatedHooks;
    constructor();
    hook<NameT extends HookNameT>(name: NameT, fn: InferCallback<HooksT, NameT>): () => void;
    hookOnce<NameT extends HookNameT>(name: NameT, fn: InferCallback<HooksT, NameT>): () => void;
    removeHook<NameT extends HookNameT>(name: NameT, fn: InferCallback<HooksT, NameT>): void;
    deprecateHook<NameT extends HookNameT>(name: NameT, deprecated: DeprecatedHook<HooksT>): void;
    deprecateHooks(deprecatedHooks: Record<HookNameT, DeprecatedHook<HooksT>>): void;
    addHooks(configHooks: NestedHooks<HooksT>): () => void;
    removeHooks(configHooks: NestedHooks<HooksT>): void;
    callHook<NameT extends HookNameT>(name: NameT, ...args: Parameters<InferCallback<HooksT, NameT>>): Promise<any>;
    callHookParallel<NameT extends HookNameT>(name: NameT, ...args: Parameters<InferCallback<HooksT, NameT>>): Promise<any[]>;
    callHookWith<NameT extends HookNameT, CallFunction extends (hooks: HookCallback[], args: Parameters<InferCallback<HooksT, NameT>>) => any>(caller: CallFunction, name: NameT, ...args: Parameters<InferCallback<HooksT, NameT>>): void | ReturnType<CallFunction>;
}
declare function createHooks<T>(): Hookable<T>;

declare function flatHooks<T>(configHooks: NestedHooks<T>, hooks?: T, parentName?: string): T;
declare function mergeHooks<T>(...hooks: NestedHooks<T>[]): T;
declare function serial<T>(tasks: T[], fn: (task: T) => Promise<any> | any): Promise<any>;
declare function serialCaller(hooks: HookCallback[], args?: any[]): Promise<any>;
declare function parallelCaller(hooks: HookCallback[], args?: any[]): Promise<any[]>;

export { DeprecatedHook, DeprecatedHooks, HookCallback, HookKeys, Hookable, Hooks, NestedHooks, createHooks, flatHooks, mergeHooks, parallelCaller, serial, serialCaller };
