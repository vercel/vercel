import type { integer } from 'vscode-languageserver-types';
export * from 'vscode-jsonrpc';
export * from 'vscode-languageserver-types';
export * from './messages';
export * from './protocol';
export { ProtocolConnection, createProtocolConnection } from './connection';
export declare namespace LSPErrorCodes {
    /**
    * This is the start range of LSP reserved error codes.
    * It doesn't denote a real error code.
    *
    * @since 3.16.0
    */
    const lspReservedErrorRangeStart: integer;
    const ContentModified: integer;
    const RequestCancelled: integer;
    /**
    * This is the end range of LSP reserved error codes.
    * It doesn't denote a real error code.
    *
    * @since 3.16.0
    */
    const lspReservedErrorRangeEnd: integer;
}
export declare namespace Proposed {
}
