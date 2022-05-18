"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SemanticTokensBuilder = exports.SemanticTokensFeature = void 0;
const vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
const SemanticTokensFeature = (Base) => {
    return class extends Base {
        get semanticTokens() {
            return {
                on: (handler) => {
                    const type = vscode_languageserver_protocol_1.SemanticTokensRequest.type;
                    this.connection.onRequest(type, (params, cancel) => {
                        return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
                    });
                },
                onDelta: (handler) => {
                    const type = vscode_languageserver_protocol_1.SemanticTokensDeltaRequest.type;
                    this.connection.onRequest(type, (params, cancel) => {
                        return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
                    });
                },
                onRange: (handler) => {
                    const type = vscode_languageserver_protocol_1.SemanticTokensRangeRequest.type;
                    this.connection.onRequest(type, (params, cancel) => {
                        return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
                    });
                }
            };
        }
    };
};
exports.SemanticTokensFeature = SemanticTokensFeature;
class SemanticTokensBuilder {
    constructor() {
        this._prevData = undefined;
        this.initialize();
    }
    initialize() {
        this._id = Date.now();
        this._prevLine = 0;
        this._prevChar = 0;
        this._data = [];
        this._dataLen = 0;
    }
    push(line, char, length, tokenType, tokenModifiers) {
        let pushLine = line;
        let pushChar = char;
        if (this._dataLen > 0) {
            pushLine -= this._prevLine;
            if (pushLine === 0) {
                pushChar -= this._prevChar;
            }
        }
        this._data[this._dataLen++] = pushLine;
        this._data[this._dataLen++] = pushChar;
        this._data[this._dataLen++] = length;
        this._data[this._dataLen++] = tokenType;
        this._data[this._dataLen++] = tokenModifiers;
        this._prevLine = line;
        this._prevChar = char;
    }
    get id() {
        return this._id.toString();
    }
    previousResult(id) {
        if (this.id === id) {
            this._prevData = this._data;
        }
        this.initialize();
    }
    build() {
        this._prevData = undefined;
        return {
            resultId: this.id,
            data: this._data
        };
    }
    canBuildEdits() {
        return this._prevData !== undefined;
    }
    buildEdits() {
        if (this._prevData !== undefined) {
            const prevDataLength = this._prevData.length;
            const dataLength = this._data.length;
            let startIndex = 0;
            while (startIndex < dataLength && startIndex < prevDataLength && this._prevData[startIndex] === this._data[startIndex]) {
                startIndex++;
            }
            if (startIndex < dataLength && startIndex < prevDataLength) {
                // Find end index
                let endIndex = 0;
                while (endIndex < dataLength && endIndex < prevDataLength && this._prevData[prevDataLength - 1 - endIndex] === this._data[dataLength - 1 - endIndex]) {
                    endIndex++;
                }
                const newData = this._data.slice(startIndex, dataLength - endIndex);
                const result = {
                    resultId: this.id,
                    edits: [
                        { start: startIndex, deleteCount: prevDataLength - endIndex - startIndex, data: newData }
                    ]
                };
                return result;
            }
            else if (startIndex < dataLength) {
                return { resultId: this.id, edits: [
                        { start: startIndex, deleteCount: 0, data: this._data.slice(startIndex) }
                    ] };
            }
            else if (startIndex < prevDataLength) {
                return { resultId: this.id, edits: [
                        { start: startIndex, deleteCount: prevDataLength - startIndex }
                    ] };
            }
            else {
                return { resultId: this.id, edits: [] };
            }
        }
        else {
            return this.build();
        }
    }
}
exports.SemanticTokensBuilder = SemanticTokensBuilder;
//# sourceMappingURL=semanticTokens.js.map