/// <reference types="node" />
import { NetStream, CommandItem } from "./types";
import Deque = require("denque");
import { EventEmitter } from "events";
import SubscriptionSet from "./SubscriptionSet";
interface Condition {
    select: number;
    auth: string;
    subscriber: false | SubscriptionSet;
}
interface DataHandledable extends EventEmitter {
    stream: NetStream;
    status: string;
    condition: Condition;
    commandQueue: Deque<CommandItem>;
    disconnect(reconnect: boolean): void;
    recoverFromFatalError(commandError: Error, err: Error, options: any): void;
    handleReconnection(err: Error, item: CommandItem): void;
}
interface ParserOptions {
    stringNumbers: boolean;
}
export default class DataHandler {
    private redis;
    constructor(redis: DataHandledable, parserOptions: ParserOptions);
    private returnFatalError;
    private returnError;
    private returnReply;
    private handleSubscriberReply;
    private handleMonitorReply;
    private shiftCommand;
}
export {};
