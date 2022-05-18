/// <reference types="node" />
import { RunningScriptOptions } from 'vm';
import { Files } from './bundle';
export interface CreateEvaluateOptions {
    basedir?: string;
    runInNewContext?: 'once' | boolean;
    runningScriptOptions?: RunningScriptOptions;
}
export declare type EvaluateModule = (filename: string, context: Object) => any;
export declare function createEvaluateModule(files: Files, { basedir, runInNewContext, runningScriptOptions }: CreateEvaluateOptions): EvaluateModule;
