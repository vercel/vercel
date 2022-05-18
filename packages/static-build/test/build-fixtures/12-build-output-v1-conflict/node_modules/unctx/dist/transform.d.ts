import MagicString from 'magic-string';

interface TransformerOptions {
    /**
     * The function names to be transformed.
     *
     * @default ['withAsyncContext', 'callAsync']
     */
    asyncFunctions?: string[];
    /**
     * @default 'unctx'
     */
    helperModule?: string;
    /**
     * @default 'executeAsync'
     */
    helperName?: string;
}
declare function createTransformer(options?: TransformerOptions): {
    transform: (code: string, opts?: {
        force?: false;
    }) => {
        code: string;
        magicString: MagicString;
    };
    shouldTransform: (code: string) => boolean;
};

export { TransformerOptions, createTransformer };
