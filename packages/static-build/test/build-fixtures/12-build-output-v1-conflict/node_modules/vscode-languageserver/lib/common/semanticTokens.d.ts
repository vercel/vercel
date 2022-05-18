import { SemanticTokens, SemanticTokensPartialResult, SemanticTokensDelta, SemanticTokensDeltaPartialResult, SemanticTokensParams, SemanticTokensDeltaParams, SemanticTokensRangeParams } from 'vscode-languageserver-protocol';
import type { Feature, _Languages, ServerRequestHandler } from './server';
/**
 * Shape of the semantic token feature
 *
 * @since 3.16.0
 */
export interface SemanticTokensFeatureShape {
    semanticTokens: {
        on(handler: ServerRequestHandler<SemanticTokensParams, SemanticTokens, SemanticTokensPartialResult, void>): void;
        onDelta(handler: ServerRequestHandler<SemanticTokensDeltaParams, SemanticTokensDelta | SemanticTokens, SemanticTokensDeltaPartialResult | SemanticTokensDeltaPartialResult, void>): void;
        onRange(handler: ServerRequestHandler<SemanticTokensRangeParams, SemanticTokens, SemanticTokensPartialResult, void>): void;
    };
}
export declare const SemanticTokensFeature: Feature<_Languages, SemanticTokensFeatureShape>;
export declare class SemanticTokensBuilder {
    private _id;
    private _prevLine;
    private _prevChar;
    private _data;
    private _dataLen;
    private _prevData;
    constructor();
    private initialize;
    push(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void;
    get id(): string;
    previousResult(id: string): void;
    build(): SemanticTokens;
    canBuildEdits(): boolean;
    buildEdits(): SemanticTokens | SemanticTokensDelta;
}
