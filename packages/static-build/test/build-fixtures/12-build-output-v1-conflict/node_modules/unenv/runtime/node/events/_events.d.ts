export declare function EventEmitter(): void;
export declare namespace EventEmitter {
    var EventEmitter: typeof import("./_events").EventEmitter;
    var init: () => void;
    var listenerCount: (emitter: any, type: any) => any;
}
export declare function once(emitter: any, name: any): Promise<unknown>;
