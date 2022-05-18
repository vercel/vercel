interface UseContext<T> {
    use: () => T | null;
    set: (instance?: T, replace?: Boolean) => void;
    unset: () => void;
    call: <R>(instance: T, cb: () => R) => R;
    callAsync: <R>(instance: T, cb: () => R | Promise<R>) => Promise<R>;
}
declare function createContext<T = any>(): UseContext<T>;
interface ContextNamespace {
    get: <T>(key: string) => UseContext<T>;
}
declare function createNamespace(): {
    get(key: any): UseContext<any>;
};
declare const defaultNamespace: ContextNamespace;
declare const getContext: <T>(key: string) => UseContext<T>;
declare const useContext: <T>(key: string) => () => T;
declare type AsyncFn<T> = () => Promise<T>;
declare function executeAsync<T>(fn: AsyncFn<T>): [Promise<T>, () => void];
declare function withAsyncContext<T = any>(fn: AsyncFn<T>, transformed?: boolean): AsyncFn<T>;

export { ContextNamespace, UseContext, createContext, createNamespace, defaultNamespace, executeAsync, getContext, useContext, withAsyncContext };
