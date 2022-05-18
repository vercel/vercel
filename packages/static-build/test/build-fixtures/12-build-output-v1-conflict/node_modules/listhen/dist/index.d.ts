import http from 'http';
import https from 'https';
import { SelfsignedOptions } from 'selfsigned';
import { GetPortInput } from 'get-port-please';

declare module 'selfsigned' {
    interface SelfsignedOptions {
        attrs?: any;
        keySize?: number;
        days?: number;
        algorithm?: string;
        extensions?: any[];
        pkcs7?: boolean;
        clientCertificate?: undefined;
        clientCertificateCN?: string;
    }
    interface GenerateResult {
        private: string;
        public: string;
        cert: string;
    }
    function generate(attrs?: any, opts?: SelfsignedOptions, cb?: (err: undefined | Error, result: GenerateResult) => any): any;
}

interface Certificate {
    key: string;
    cert: string;
}
interface CertificateInput {
    key: string;
    cert: string;
}
interface ListenOptions {
    name: string;
    port?: GetPortInput;
    hostname?: string;
    https?: boolean;
    selfsigned?: SelfsignedOptions;
    showURL: boolean;
    baseURL: string;
    open: boolean;
    certificate: Certificate;
    clipboard: boolean;
    isTest: Boolean;
    isProd: Boolean;
    autoClose: Boolean;
    autoCloseSignals: string[];
}
interface Listener {
    url: string;
    server: http.Server | https.Server;
    close: () => Promise<void>;
    open: () => Promise<void>;
    showURL: () => void;
}
declare function listen(handle: http.RequestListener, opts?: Partial<ListenOptions>): Promise<Listener>;

export { Certificate, CertificateInput, ListenOptions, Listener, listen };
