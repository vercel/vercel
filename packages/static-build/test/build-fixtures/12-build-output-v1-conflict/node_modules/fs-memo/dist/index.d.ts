interface MemoOptions {
    dir: string;
    name: string;
    file: string;
}
declare function getMemo(config: Partial<MemoOptions>): Promise<any>;
declare function setMemo(memo: object, config: Partial<MemoOptions>): Promise<void>;

export { getMemo, setMemo };
