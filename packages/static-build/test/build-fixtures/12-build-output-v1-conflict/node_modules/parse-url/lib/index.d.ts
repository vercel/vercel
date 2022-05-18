declare interface ParsedUrl {
    protocols: string[];
    protocol: string;
    port?: string;
    resource: string;
    user: string;
    pathname: string;
    hash: string;
    search: string;
    href: string;
    query: {
        [key: string]: any;
    }
}

declare function parseUrl(url: string, normalize?: boolean | Object): ParsedUrl;

export default parseUrl
