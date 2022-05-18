import { CreateEvaluateOptions } from './module';
export declare type Files = {
    [name: string]: any;
};
export declare type CreateBundleOptions = CreateEvaluateOptions;
export declare type Bundle = {
    basedir: string;
    entry: string;
    files: {
        [filename: string]: string;
    };
    maps: {
        [filename: string]: string;
    };
};
export declare function createBundle(_bundle: Partial<Bundle> | string, options?: CreateBundleOptions): {
    bundle: Bundle;
    evaluateModule: import("./module").EvaluateModule;
    evaluateEntry: (context: object) => any;
    rewriteErrorTrace: (err: Error) => Promise<Error>;
};
