"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingMonitor = exports.LanguageClient = exports.TransportKind = void 0;
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const SemVer = require("semver");
const vscode_1 = require("vscode");
const Is = require("../common/utils/is");
const commonClient_1 = require("../common/commonClient");
const client_1 = require("../common/client");
const processes_1 = require("./processes");
const node_1 = require("vscode-languageserver-protocol/node");
__exportStar(require("vscode-languageserver-protocol/node"), exports);
__exportStar(require("../common/api"), exports);
const REQUIRED_VSCODE_VERSION = '^1.52.0'; // do not change format, updated by `updateVSCode` script
var Executable;
(function (Executable) {
    function is(value) {
        return Is.string(value.command);
    }
    Executable.is = is;
})(Executable || (Executable = {}));
var TransportKind;
(function (TransportKind) {
    TransportKind[TransportKind["stdio"] = 0] = "stdio";
    TransportKind[TransportKind["ipc"] = 1] = "ipc";
    TransportKind[TransportKind["pipe"] = 2] = "pipe";
    TransportKind[TransportKind["socket"] = 3] = "socket";
})(TransportKind = exports.TransportKind || (exports.TransportKind = {}));
var Transport;
(function (Transport) {
    function isSocket(value) {
        let candidate = value;
        return candidate && candidate.kind === TransportKind.socket && Is.number(candidate.port);
    }
    Transport.isSocket = isSocket;
})(Transport || (Transport = {}));
var NodeModule;
(function (NodeModule) {
    function is(value) {
        return Is.string(value.module);
    }
    NodeModule.is = is;
})(NodeModule || (NodeModule = {}));
var StreamInfo;
(function (StreamInfo) {
    function is(value) {
        let candidate = value;
        return candidate && candidate.writer !== void 0 && candidate.reader !== void 0;
    }
    StreamInfo.is = is;
})(StreamInfo || (StreamInfo = {}));
var ChildProcessInfo;
(function (ChildProcessInfo) {
    function is(value) {
        let candidate = value;
        return candidate && candidate.process !== void 0 && typeof candidate.detached === 'boolean';
    }
    ChildProcessInfo.is = is;
})(ChildProcessInfo || (ChildProcessInfo = {}));
class LanguageClient extends commonClient_1.CommonLanguageClient {
    constructor(arg1, arg2, arg3, arg4, arg5) {
        let id;
        let name;
        let serverOptions;
        let clientOptions;
        let forceDebug;
        if (Is.string(arg2)) {
            id = arg1;
            name = arg2;
            serverOptions = arg3;
            clientOptions = arg4;
            forceDebug = !!arg5;
        }
        else {
            id = arg1.toLowerCase();
            name = arg1;
            serverOptions = arg2;
            clientOptions = arg3;
            forceDebug = arg4;
        }
        if (forceDebug === void 0) {
            forceDebug = false;
        }
        super(id, name, clientOptions);
        this._serverOptions = serverOptions;
        this._forceDebug = forceDebug;
        try {
            this.checkVersion();
        }
        catch (error) {
            if (Is.string(error.message)) {
                this.outputChannel.appendLine(error.message);
            }
            throw error;
        }
    }
    checkVersion() {
        let codeVersion = SemVer.parse(vscode_1.version);
        if (!codeVersion) {
            throw new Error(`No valid VS Code version detected. Version string is: ${vscode_1.version}`);
        }
        // Remove the insider pre-release since we stay API compatible.
        if (codeVersion.prerelease && codeVersion.prerelease.length > 0) {
            codeVersion.prerelease = [];
        }
        if (!SemVer.satisfies(codeVersion, REQUIRED_VSCODE_VERSION)) {
            throw new Error(`The language client requires VS Code version ${REQUIRED_VSCODE_VERSION} but received version ${vscode_1.version}`);
        }
    }
    stop() {
        return super.stop().then(() => {
            if (this._serverProcess) {
                let toCheck = this._serverProcess;
                this._serverProcess = undefined;
                if (this._isDetached === void 0 || !this._isDetached) {
                    this.checkProcessDied(toCheck);
                }
                this._isDetached = undefined;
            }
        });
    }
    checkProcessDied(childProcess) {
        if (!childProcess) {
            return;
        }
        setTimeout(() => {
            // Test if the process is still alive. Throws an exception if not
            try {
                process.kill(childProcess.pid, 0);
                processes_1.terminate(childProcess);
            }
            catch (error) {
                // All is fine.
            }
        }, 2000);
    }
    handleConnectionClosed() {
        this._serverProcess = undefined;
        super.handleConnectionClosed();
    }
    fillInitializeParams(params) {
        super.fillInitializeParams(params);
        if (params.processId === null) {
            params.processId = process.pid;
        }
    }
    createMessageTransports(encoding) {
        function getEnvironment(env, fork) {
            if (!env && !fork) {
                return undefined;
            }
            let result = Object.create(null);
            Object.keys(process.env).forEach(key => result[key] = process.env[key]);
            if (fork) {
                result['ELECTRON_RUN_AS_NODE'] = '1';
                result['ELECTRON_NO_ASAR'] = '1';
            }
            if (env) {
                Object.keys(env).forEach(key => result[key] = env[key]);
            }
            return result;
        }
        const debugStartWith = ['--debug=', '--debug-brk=', '--inspect=', '--inspect-brk='];
        const debugEquals = ['--debug', '--debug-brk', '--inspect', '--inspect-brk'];
        function startedInDebugMode() {
            let args = process.execArgv;
            if (args) {
                return args.some((arg) => {
                    return debugStartWith.some(value => arg.startsWith(value)) ||
                        debugEquals.some(value => arg === value);
                });
            }
            return false;
        }
        function assertStdio(process) {
            if (process.stdin === null || process.stdout === null || process.stderr === null) {
                throw new Error('Process created without stdio streams');
            }
        }
        let server = this._serverOptions;
        // We got a function.
        if (Is.func(server)) {
            return server().then((result) => {
                if (client_1.MessageTransports.is(result)) {
                    this._isDetached = !!result.detached;
                    return result;
                }
                else if (StreamInfo.is(result)) {
                    this._isDetached = !!result.detached;
                    return { reader: new node_1.StreamMessageReader(result.reader), writer: new node_1.StreamMessageWriter(result.writer) };
                }
                else {
                    let cp;
                    if (ChildProcessInfo.is(result)) {
                        cp = result.process;
                        this._isDetached = result.detached;
                    }
                    else {
                        cp = result;
                        this._isDetached = false;
                    }
                    cp.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                    return { reader: new node_1.StreamMessageReader(cp.stdout), writer: new node_1.StreamMessageWriter(cp.stdin) };
                }
            });
        }
        let json;
        let runDebug = server;
        if (runDebug.run || runDebug.debug) {
            if (this._forceDebug || startedInDebugMode()) {
                json = runDebug.debug;
            }
            else {
                json = runDebug.run;
            }
        }
        else {
            json = server;
        }
        return this._getServerWorkingDir(json.options).then(serverWorkingDir => {
            if (NodeModule.is(json) && json.module) {
                let node = json;
                let transport = node.transport || TransportKind.stdio;
                if (node.runtime) {
                    let args = [];
                    let options = node.options || Object.create(null);
                    if (options.execArgv) {
                        options.execArgv.forEach(element => args.push(element));
                    }
                    args.push(node.module);
                    if (node.args) {
                        node.args.forEach(element => args.push(element));
                    }
                    const execOptions = Object.create(null);
                    execOptions.cwd = serverWorkingDir;
                    execOptions.env = getEnvironment(options.env, false);
                    const runtime = this._getRuntimePath(node.runtime, serverWorkingDir);
                    let pipeName = undefined;
                    if (transport === TransportKind.ipc) {
                        // exec options not correctly typed in lib
                        execOptions.stdio = [null, null, null, 'ipc'];
                        args.push('--node-ipc');
                    }
                    else if (transport === TransportKind.stdio) {
                        args.push('--stdio');
                    }
                    else if (transport === TransportKind.pipe) {
                        pipeName = node_1.generateRandomPipeName();
                        args.push(`--pipe=${pipeName}`);
                    }
                    else if (Transport.isSocket(transport)) {
                        args.push(`--socket=${transport.port}`);
                    }
                    args.push(`--clientProcessId=${process.pid.toString()}`);
                    if (transport === TransportKind.ipc || transport === TransportKind.stdio) {
                        let serverProcess = cp.spawn(runtime, args, execOptions);
                        if (!serverProcess || !serverProcess.pid) {
                            return Promise.reject(`Launching server using runtime ${runtime} failed.`);
                        }
                        this._serverProcess = serverProcess;
                        serverProcess.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                        if (transport === TransportKind.ipc) {
                            serverProcess.stdout.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                            return Promise.resolve({ reader: new node_1.IPCMessageReader(serverProcess), writer: new node_1.IPCMessageWriter(serverProcess) });
                        }
                        else {
                            return Promise.resolve({ reader: new node_1.StreamMessageReader(serverProcess.stdout), writer: new node_1.StreamMessageWriter(serverProcess.stdin) });
                        }
                    }
                    else if (transport === TransportKind.pipe) {
                        return node_1.createClientPipeTransport(pipeName).then((transport) => {
                            let process = cp.spawn(runtime, args, execOptions);
                            if (!process || !process.pid) {
                                return Promise.reject(`Launching server using runtime ${runtime} failed.`);
                            }
                            this._serverProcess = process;
                            process.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                            process.stdout.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                            return transport.onConnected().then((protocol) => {
                                return { reader: protocol[0], writer: protocol[1] };
                            });
                        });
                    }
                    else if (Transport.isSocket(transport)) {
                        return node_1.createClientSocketTransport(transport.port).then((transport) => {
                            let process = cp.spawn(runtime, args, execOptions);
                            if (!process || !process.pid) {
                                return Promise.reject(`Launching server using runtime ${runtime} failed.`);
                            }
                            this._serverProcess = process;
                            process.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                            process.stdout.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                            return transport.onConnected().then((protocol) => {
                                return { reader: protocol[0], writer: protocol[1] };
                            });
                        });
                    }
                }
                else {
                    let pipeName = undefined;
                    return new Promise((resolve, _reject) => {
                        let args = node.args && node.args.slice() || [];
                        if (transport === TransportKind.ipc) {
                            args.push('--node-ipc');
                        }
                        else if (transport === TransportKind.stdio) {
                            args.push('--stdio');
                        }
                        else if (transport === TransportKind.pipe) {
                            pipeName = node_1.generateRandomPipeName();
                            args.push(`--pipe=${pipeName}`);
                        }
                        else if (Transport.isSocket(transport)) {
                            args.push(`--socket=${transport.port}`);
                        }
                        args.push(`--clientProcessId=${process.pid.toString()}`);
                        let options = node.options || Object.create(null);
                        options.env = getEnvironment(options.env, true);
                        options.execArgv = options.execArgv || [];
                        options.cwd = serverWorkingDir;
                        options.silent = true;
                        if (transport === TransportKind.ipc || transport === TransportKind.stdio) {
                            let sp = cp.fork(node.module, args || [], options);
                            assertStdio(sp);
                            this._serverProcess = sp;
                            sp.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                            if (transport === TransportKind.ipc) {
                                sp.stdout.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                                resolve({ reader: new node_1.IPCMessageReader(this._serverProcess), writer: new node_1.IPCMessageWriter(this._serverProcess) });
                            }
                            else {
                                resolve({ reader: new node_1.StreamMessageReader(sp.stdout), writer: new node_1.StreamMessageWriter(sp.stdin) });
                            }
                        }
                        else if (transport === TransportKind.pipe) {
                            node_1.createClientPipeTransport(pipeName).then((transport) => {
                                let sp = cp.fork(node.module, args || [], options);
                                assertStdio(sp);
                                this._serverProcess = sp;
                                sp.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                                sp.stdout.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                                transport.onConnected().then((protocol) => {
                                    resolve({ reader: protocol[0], writer: protocol[1] });
                                });
                            });
                        }
                        else if (Transport.isSocket(transport)) {
                            node_1.createClientSocketTransport(transport.port).then((transport) => {
                                let sp = cp.fork(node.module, args || [], options);
                                assertStdio(sp);
                                this._serverProcess = sp;
                                sp.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                                sp.stdout.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                                transport.onConnected().then((protocol) => {
                                    resolve({ reader: protocol[0], writer: protocol[1] });
                                });
                            });
                        }
                    });
                }
            }
            else if (Executable.is(json) && json.command) {
                let command = json;
                let args = command.args || [];
                let options = Object.assign({}, command.options);
                options.cwd = options.cwd || serverWorkingDir;
                let serverProcess = cp.spawn(command.command, args, options);
                if (!serverProcess || !serverProcess.pid) {
                    return Promise.reject(`Launching server using command ${command.command} failed.`);
                }
                serverProcess.stderr.on('data', data => this.outputChannel.append(Is.string(data) ? data : data.toString(encoding)));
                this._serverProcess = serverProcess;
                this._isDetached = !!options.detached;
                return Promise.resolve({ reader: new node_1.StreamMessageReader(serverProcess.stdout), writer: new node_1.StreamMessageWriter(serverProcess.stdin) });
            }
            return Promise.reject(new Error(`Unsupported server configuration ` + JSON.stringify(server, null, 4)));
        });
    }
    _getRuntimePath(runtime, serverWorkingDirectory) {
        if (path.isAbsolute(runtime)) {
            return runtime;
        }
        const mainRootPath = this._mainGetRootPath();
        if (mainRootPath !== undefined) {
            const result = path.join(mainRootPath, runtime);
            if (fs.existsSync(result)) {
                return result;
            }
        }
        if (serverWorkingDirectory !== undefined) {
            const result = path.join(serverWorkingDirectory, runtime);
            if (fs.existsSync(result)) {
                return result;
            }
        }
        return runtime;
    }
    _mainGetRootPath() {
        let folders = vscode_1.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }
        let folder = folders[0];
        if (folder.uri.scheme === 'file') {
            return folder.uri.fsPath;
        }
        return undefined;
    }
    _getServerWorkingDir(options) {
        let cwd = options && options.cwd;
        if (!cwd) {
            cwd = this.clientOptions.workspaceFolder
                ? this.clientOptions.workspaceFolder.uri.fsPath
                : this._mainGetRootPath();
        }
        if (cwd) {
            // make sure the folder exists otherwise creating the process will fail
            return new Promise(s => {
                fs.lstat(cwd, (err, stats) => {
                    s(!err && stats.isDirectory() ? cwd : undefined);
                });
            });
        }
        return Promise.resolve(undefined);
    }
    getLocale() {
        const envValue = process.env['VSCODE_NLS_CONFIG'];
        if (envValue === undefined) {
            return 'en';
        }
        let config = undefined;
        try {
            config = JSON.parse(envValue);
        }
        catch (err) {
        }
        if (config === undefined || typeof config.locale !== 'string') {
            return 'en';
        }
        return config.locale;
    }
}
exports.LanguageClient = LanguageClient;
class SettingMonitor {
    constructor(_client, _setting) {
        this._client = _client;
        this._setting = _setting;
        this._listeners = [];
    }
    start() {
        vscode_1.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this._listeners);
        this.onDidChangeConfiguration();
        return new vscode_1.Disposable(() => {
            if (this._client.needsStop()) {
                this._client.stop();
            }
        });
    }
    onDidChangeConfiguration() {
        let index = this._setting.indexOf('.');
        let primary = index >= 0 ? this._setting.substr(0, index) : this._setting;
        let rest = index >= 0 ? this._setting.substr(index + 1) : undefined;
        let enabled = rest ? vscode_1.workspace.getConfiguration(primary).get(rest, false) : vscode_1.workspace.getConfiguration(primary);
        if (enabled && this._client.needsStart()) {
            this._client.start();
        }
        else if (!enabled && this._client.needsStop()) {
            this._client.stop();
        }
    }
}
exports.SettingMonitor = SettingMonitor;
//# sourceMappingURL=main.js.map