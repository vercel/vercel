declare type RC = Record<string, any>;
interface RCOptions {
    name?: string;
    dir?: string;
    flat?: boolean;
}
declare const defaults: RCOptions;
declare function parse(contents: string, options?: RCOptions): RC;
declare function parseFile(path: string, options?: RCOptions): RC;
declare function read(options?: RCOptions | string): RC;
declare function readUser(options?: RCOptions | string): RC;
declare function serialize(config: RC): string;
declare function write(config: RC, options?: RCOptions | string): void;
declare function writeUser(config: RC, options?: RCOptions | string): void;
declare function update(config: RC, options?: RCOptions | string): RC;
declare function updateUser(config: RC, options?: RCOptions | string): RC;

export { defaults, parse, parseFile, read, readUser, serialize, update, updateUser, write, writeUser };
