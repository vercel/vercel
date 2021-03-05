declare module 'is-port-reachable' {
  export interface IsPortReachableOptions {
    timeout?: number | undefined;
    host?: string;
  }
  export default function(
    port: number | undefined,
    options?: IsPortReachableOptions
  ): Promise<boolean>;
}
