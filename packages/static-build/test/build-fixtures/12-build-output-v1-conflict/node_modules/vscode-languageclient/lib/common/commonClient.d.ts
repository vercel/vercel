import { BaseLanguageClient, LanguageClientOptions, StaticFeature, DynamicFeature } from './client';
export declare abstract class CommonLanguageClient extends BaseLanguageClient {
    constructor(id: string, name: string, clientOptions: LanguageClientOptions);
    registerProposedFeatures(): void;
    protected registerBuiltinFeatures(): void;
}
export declare namespace ProposedFeatures {
    function createAll(_client: BaseLanguageClient): (StaticFeature | DynamicFeature<any>)[];
}
