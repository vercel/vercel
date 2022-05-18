export declare const useError: () => any;
export declare const throwError: (_err: string | Error) => Error;
export declare const clearError: (options?: {
    redirect?: string;
}) => Promise<void>;
