declare const NODE_TYPES: {
    NORMAL: 0;
    WILDCARD: 1;
    PLACEHOLDER: 2;
};
declare type _NODE_TYPES = typeof NODE_TYPES;
declare type NODE_TYPE = _NODE_TYPES[keyof _NODE_TYPES];
declare type _RadixNodeDataObject = {
    params?: never;
    [key: string]: any;
};
declare type RadixNodeData<T extends _RadixNodeDataObject = _RadixNodeDataObject> = T;
declare type MatchedRoute<T extends RadixNodeData = RadixNodeData> = Omit<T, 'params'> & {
    params?: Record<string, any>;
};
interface RadixNode<T extends RadixNodeData = RadixNodeData> {
    type: NODE_TYPE;
    parent: RadixNode<T> | null;
    children: Record<string, RadixNode<T>>;
    data: RadixNodeData | null;
    paramName: string | null;
    wildcardChildNode: RadixNode<T> | null;
    placeholderChildNode: RadixNode<T> | null;
}
interface RadixRouterContext<T extends RadixNodeData = RadixNodeData> {
    rootNode: RadixNode<T>;
    staticRoutesMap: Record<string, RadixNode>;
}
interface RadixRouterInitOptions {
    routes?: Record<string, any>;
}
interface RadixRouter<T extends RadixNodeData = RadixNodeData> {
    ctx: RadixRouterContext<T>;
    /**
     * Perform lookup of given path in radix tree
     * @param path - the path to search for
     *
     * @returns The data that was originally inserted into the tree
    */
    lookup(path: string): MatchedRoute<T> | null;
    /**
     * Perform lookup of all paths that start with the given prefix
     * @param The prefix to match
     *
     * @returns An array of matches along with any data that was originally passed in when inserted
    */
    lookupAll(prefix: string): MatchedRoute<T>[];
    /**
     * Perform an insert into the radix tree
     * @param path - the prefix to match
     * @param data - the associated data to path
     *
    */
    insert(path: string, data: T): void;
    /**
     * Perform a remove on the tree
     * @param { string } data.path - the route to match
     *
     * @returns A boolean signifying if the remove was successful or not
    */
    remove(path: string): boolean;
}

declare function createRouter<T extends RadixNodeData = RadixNodeData>(options?: RadixRouterInitOptions): RadixRouter<T>;

export { MatchedRoute, NODE_TYPE, NODE_TYPES, RadixNode, RadixNodeData, RadixRouter, RadixRouterContext, RadixRouterInitOptions, createRouter };
