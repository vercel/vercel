declare const _default: {
    watch(_dir: string, _cb: Function): Promise<void>;
    getInfo(path: string, _flags: number, _id: string): {
        event: string;
        path: string;
        type: string;
        flags: number;
        changes: {
            inode: boolean;
            finder: boolean;
            access: boolean;
            xattrs: boolean;
        };
    };
};
export default _default;
