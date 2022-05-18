import * as code from 'vscode';
export default class ProtocolCallHierarchyItem extends code.CallHierarchyItem {
    data?: unknown;
    constructor(kind: code.SymbolKind, name: string, detail: string, uri: code.Uri, range: code.Range, selectionRange: code.Range, data?: unknown);
}
