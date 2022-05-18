import { Checker } from '../../Checker.js';
import { CreateDiagnostic } from '../../types.js';
import 'vite';
import '../../worker.js';
import 'worker_threads';
import 'eslint';
import './initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';

declare const createDiagnostic: CreateDiagnostic<'vls'>;
declare class VlsChecker extends Checker<'vls'> {
    constructor();
    init(): void;
}

export { VlsChecker, createDiagnostic };
