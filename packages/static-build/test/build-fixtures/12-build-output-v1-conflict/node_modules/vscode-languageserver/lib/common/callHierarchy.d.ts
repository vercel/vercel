import { CallHierarchyItem, CallHierarchyPrepareParams, CallHierarchyIncomingCallsParams, CallHierarchyIncomingCall, CallHierarchyOutgoingCallsParams, CallHierarchyOutgoingCall } from 'vscode-languageserver-protocol';
import type { Feature, _Languages, ServerRequestHandler } from './server';
/**
 * Shape of the call hierarchy feature
 *
 * @since 3.16.0
 */
export interface CallHierarchy {
    callHierarchy: {
        onPrepare(handler: ServerRequestHandler<CallHierarchyPrepareParams, CallHierarchyItem[] | null, never, void>): void;
        onIncomingCalls(handler: ServerRequestHandler<CallHierarchyIncomingCallsParams, CallHierarchyIncomingCall[] | null, CallHierarchyIncomingCall[], void>): void;
        onOutgoingCalls(handler: ServerRequestHandler<CallHierarchyOutgoingCallsParams, CallHierarchyOutgoingCall[] | null, CallHierarchyOutgoingCall[], void>): void;
    };
}
export declare const CallHierarchyFeature: Feature<_Languages, CallHierarchy>;
