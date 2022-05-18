/// <reference types="node" />
import { NodeFileTraceOptions, NodeFileTraceResult, NodeFileTraceReasons, Stats, NodeFileTraceReasonType } from './types';
export declare function nodeFileTrace(files: string[], opts?: NodeFileTraceOptions): Promise<NodeFileTraceResult>;
export declare class Job {
    ts: boolean;
    base: string;
    cwd: string;
    conditions: string[];
    exportsOnly: boolean;
    paths: Record<string, string>;
    ignoreFn: (path: string, parent?: string) => boolean;
    log: boolean;
    mixedModules: boolean;
    analysis: {
        emitGlobs?: boolean;
        computeFileReferences?: boolean;
        evaluatePureExpressions?: boolean;
    };
    private fileCache;
    private statCache;
    private symlinkCache;
    private analysisCache;
    fileList: Set<string>;
    esmFileList: Set<string>;
    processed: Set<string>;
    warnings: Set<Error>;
    reasons: NodeFileTraceReasons;
    constructor({ base, processCwd, exports, conditions, exportsOnly, paths, ignore, log, mixedModules, ts, analysis, cache, }: NodeFileTraceOptions);
    readlink(path: string): Promise<string | null>;
    isFile(path: string): Promise<boolean>;
    isDir(path: string): Promise<boolean>;
    stat(path: string): Promise<Stats | null>;
    resolve(id: string, parent: string, job: Job, cjsResolve: boolean): Promise<string | string[]>;
    readFile(path: string): Promise<string | Buffer | null>;
    realpath(path: string, parent?: string, seen?: Set<unknown>): Promise<string>;
    emitFile(path: string, reasonType: NodeFileTraceReasonType, parent?: string, isRealpath?: boolean): Promise<boolean>;
    getPjsonBoundary(path: string): Promise<string | undefined>;
    emitDependency(path: string, parent?: string): Promise<void>;
}
