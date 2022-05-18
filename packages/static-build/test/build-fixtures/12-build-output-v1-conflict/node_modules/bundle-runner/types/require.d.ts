/// <reference types="node" />
import { Files } from './bundle';
import { EvaluateModule } from './module';
export declare function createRequire(basedir: string, files: Files, evaluateModule: EvaluateModule): NodeJS.Require;
