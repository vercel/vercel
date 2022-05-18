import * as vscode_languageserver_node from 'vscode-languageserver/node';
import { DiagnosticSeverity, Logger } from 'vscode-languageserver/node';
import { Duplex } from 'stream';
import { VLS } from 'vls';
import { URI } from 'vscode-uri';
import { NormalizedDiagnostic } from '../../logger.js';
import { DeepPartial } from '../../types.js';
import { VlsOptions } from './initParams.js';
import 'vite';
import '@babel/code-frame';
import 'vscode-languageclient';
import 'eslint';
import 'vscode-languageclient/node';
import 'typescript';
import 'worker_threads';

declare type LogLevel = typeof logLevels[number];
declare const logLevels: readonly ["ERROR", "WARN", "INFO", "HINT"];
declare const logLevel2Severity: {
    ERROR: 1;
    WARN: 2;
    INFO: 3;
    HINT: 4;
};
interface DiagnosticOptions {
    watch: boolean;
    verbose: boolean;
    config: DeepPartial<VlsOptions> | null;
    onDispatchDiagnostics?: (normalized: NormalizedDiagnostic[]) => void;
    onDispatchDiagnosticsSummary?: (errorCount: number, warningCount: number) => void;
}
declare function diagnostics(workspace: string | null, logLevel: LogLevel, options?: DiagnosticOptions): Promise<void>;
declare class NullLogger implements Logger {
    error(_message: string): void;
    warn(_message: string): void;
    info(_message: string): void;
    log(_message: string): void;
}
declare class TestStream extends Duplex {
    _write(chunk: string, _encoding: string, done: () => void): void;
    _read(_size: number): void;
}
declare function prepareClientConnection(workspaceUri: URI, severity: DiagnosticSeverity, options: DiagnosticOptions): Promise<{
    clientConnection: vscode_languageserver_node.ProtocolConnection;
    serverConnection: vscode_languageserver_node.Connection;
    vls: VLS;
    up: TestStream;
    down: TestStream;
    logger: NullLogger;
}>;

export { DiagnosticOptions, LogLevel, TestStream, diagnostics, logLevel2Severity, logLevels, prepareClientConnection };
