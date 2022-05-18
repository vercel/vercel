export declare type RawSourceMaps = {
    [source: string]: string;
};
export declare function createSourceMap(rawMaps?: RawSourceMaps): {
    rewriteErrorTrace: (err: Error) => Promise<Error>;
};
