import { Checker } from '../../Checker.js';
import 'vite';
import '../../types.js';
import 'worker_threads';
import 'eslint';
import '../vls/initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';
import '../../worker.js';

declare class EslintChecker extends Checker<'eslint'> {
    constructor();
    init(): void;
}

export { EslintChecker };
