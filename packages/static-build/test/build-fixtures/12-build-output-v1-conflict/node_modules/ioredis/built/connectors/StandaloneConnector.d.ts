/// <reference types="node" />
import { IpcNetConnectOpts, TcpNetConnectOpts } from "net";
import { ConnectionOptions } from "tls";
import { NetStream } from "../types";
import AbstractConnector, { ErrorEmitter } from "./AbstractConnector";
export declare type StandaloneConnectionOptions = (Partial<TcpNetConnectOpts> & Partial<IpcNetConnectOpts>) & {
    disconnectTimeout?: number;
    tls?: ConnectionOptions;
};
export default class StandaloneConnector extends AbstractConnector {
    protected options: StandaloneConnectionOptions;
    constructor(options: StandaloneConnectionOptions);
    connect(_: ErrorEmitter): Promise<NetStream>;
}
