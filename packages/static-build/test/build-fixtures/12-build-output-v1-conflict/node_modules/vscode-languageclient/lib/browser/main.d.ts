import { CommonLanguageClient, LanguageClientOptions, MessageTransports } from '../common/api';
export * from 'vscode-languageserver-protocol/browser';
export * from '../common/api';
export declare class LanguageClient extends CommonLanguageClient {
    private worker;
    constructor(id: string, name: string, clientOptions: LanguageClientOptions, worker: Worker);
    protected createMessageTransports(_encoding: string): Promise<MessageTransports>;
    protected getLocale(): string;
}
