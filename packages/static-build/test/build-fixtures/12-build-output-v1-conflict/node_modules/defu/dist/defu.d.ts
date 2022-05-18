declare type Input = Record<string | number | symbol, any>;
declare type Merger = <T extends Input, K extends keyof T>(obj: T, key: keyof T, value: T[K], namespace: string) => any;
declare type nullish = null | undefined | void;
declare type MergeObjects<Destination extends Input, Defaults extends Input> = Destination extends Defaults ? Destination : Omit<Destination, keyof Destination & keyof Defaults> & Omit<Defaults, keyof Destination & keyof Defaults> & {
    -readonly [Key in keyof Destination & keyof Defaults]: Destination[Key] extends nullish ? Defaults[Key] extends nullish ? nullish : Defaults[Key] : Defaults[Key] extends nullish ? Destination[Key] : Merge<Destination[Key], Defaults[Key]>;
};
declare type DefuFn = <Source extends Input, Defaults extends Input>(source: Source, ...defaults: Defaults[]) => MergeObjects<Source, Defaults>;
interface Defu {
    <Source extends Input, Defaults extends Input>(source: Source, ...defaults: Defaults[]): MergeObjects<Source, Defaults>;
    fn: DefuFn;
    arrayFn: DefuFn;
    extend(merger?: Merger): DefuFn;
}
declare type MergeArrays<Destination, Source> = Destination extends Array<infer DestinationType> ? Source extends Array<infer SourceType> ? Array<DestinationType | SourceType> : Source | Array<DestinationType> : Source | Destination;
declare type Merge<Destination extends Input, Defaults extends Input> = Destination extends nullish ? Defaults extends nullish ? nullish : Defaults : Defaults extends nullish ? Destination : Destination extends Array<any> ? Defaults extends Array<any> ? MergeArrays<Destination, Defaults> : Destination | Defaults : Destination extends Function ? Destination | Defaults : Destination extends RegExp ? Destination | Defaults : Destination extends Promise<any> ? Destination | Defaults : Defaults extends Function ? Destination | Defaults : Defaults extends RegExp ? Destination | Defaults : Defaults extends Promise<any> ? Destination | Defaults : Destination extends Input ? Defaults extends Input ? MergeObjects<Destination, Defaults> : Destination | Defaults : Destination | Defaults;

declare function createDefu(merger?: Merger): DefuFn;
declare const defu: Defu;

declare const defuFn: DefuFn;
declare const defuArrayFn: DefuFn;

export { createDefu, defu as default, defu, defuArrayFn, defuFn };
