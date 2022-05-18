import { Event as HandlerEvent } from '../function/event';
declare const services: {
    gitHub: null;
    spotify: null;
    salesforce: null;
    stripe: null;
};
export declare type Service = {
    friendlyServiceName: string;
    service: string;
    isLoggedIn: boolean;
    bearerToken: string | null;
    grantedScopes: Array<{
        scope: string;
        scopeInfo: {
            category: string | null;
            scope: string;
            display: string;
            isDefault: boolean;
            isRequired: boolean;
            description: string | null;
            title: string | null;
        };
    }> | null;
};
export declare type Services = typeof services;
export declare type ServiceKey = keyof Services;
export declare type ServiceTokens = Service;
export declare type NetlifySecrets = {
    [K in ServiceKey]?: Service;
} & {
    [key: string]: Service;
};
declare type OneGraphPayload = {
    authlifyToken: string | undefined;
};
export declare type HandlerEventWithOneGraph = HandlerEvent & OneGraphPayload;
export declare const getSecrets: (event?: HandlerEventWithOneGraph | HandlerEvent | undefined) => Promise<NetlifySecrets>;
export {};
