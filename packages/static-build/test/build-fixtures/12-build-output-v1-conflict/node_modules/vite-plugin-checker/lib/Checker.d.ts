import * as vite from 'vite';
import { BuildInCheckerNames, CreateDiagnostic, ServeAndBuildChecker, BuildInCheckers } from './types.js';
import { Script } from './worker.js';
import 'worker_threads';
import 'eslint';
import './checkers/vls/initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';

interface CheckerMeta<T extends BuildInCheckerNames> {
    name: T;
    absFilePath: string;
    createDiagnostic: CreateDiagnostic<T>;
    build: ServeAndBuildChecker['build'];
    script?: Script<any>;
}
declare abstract class Checker<T extends BuildInCheckerNames> implements CheckerMeta<T> {
    static logger: ((...args: any[]) => void)[];
    static log(...args: any[]): void;
    name: T;
    absFilePath: string;
    createDiagnostic: CreateDiagnostic<T>;
    build: ServeAndBuildChecker['build'];
    script?: Script<any>;
    constructor({ name, absFilePath, createDiagnostic, build }: CheckerMeta<T>);
    prepare(): Script<Pick<BuildInCheckers, T>>;
    initMainThread(): ((config: any, env: vite.ConfigEnv) => ServeAndBuildChecker) | undefined;
    initWorkerThread(): void;
}

export { Checker, CheckerMeta };
