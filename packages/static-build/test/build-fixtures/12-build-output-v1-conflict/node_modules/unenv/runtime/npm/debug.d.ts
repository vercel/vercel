declare const debug: () => {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
};
export default debug;
